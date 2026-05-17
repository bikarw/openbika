import { CronExpressionParser } from "cron-parser";
import { schema } from "@openbika/db";
import type { ControlPlaneDb } from "@openbika/db";
import { createId } from "@openbika/domain";
import type { ApiEnv } from "@openbika/env";
import { workflowNames } from "@openbika/queue";
import { and, eq, isNull, lte, or } from "drizzle-orm";

import { startControlPlaneWorkflow, WorkflowDispatchError } from "./workflows.js";

const DEFAULT_TICK_INTERVAL_MS = 60_000;

export interface BackupSchedulerOptions {
  db: ControlPlaneDb;
  env: ApiEnv;
  intervalMs?: number;
  /** Inject for tests; defaults to console.error in production. */
  onError?: (error: unknown, context: { scheduleId?: string }) => void;
}

export interface BackupSchedulerHandle {
  stop: () => void;
  /** Run a single tick manually (used by tests and explicit triggers). */
  tick: () => Promise<void>;
}

/** Resolve next fire-time for a schedule starting from `from`. Returns null on parse failure. */
export function computeNextRun(
  cronExpression: string,
  timezone: string,
  from: Date = new Date(),
): Date | null {
  try {
    const iterator = CronExpressionParser.parse(cronExpression, {
      currentDate: from,
      tz: timezone,
    });
    const next = iterator.next();
    return next.toDate();
  } catch {
    return null;
  }
}

/**
 * Polls `backup_schedules` for due rows and dispatches a `createBackup` workflow
 * for each. Runs in-process inside the API; safe to launch once per server.
 */
export function startBackupScheduler(
  options: BackupSchedulerOptions,
): BackupSchedulerHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  const reportError =
    options.onError ??
    ((error, context) => {
      console.error("backup-scheduler error", context, error);
    });

  let running = false;
  let stopped = false;

  async function tick(): Promise<void> {
    if (running || stopped) return;
    running = true;
    try {
      const now = new Date();
      const due = await options.db
        .select()
        .from(schema.backupSchedules)
        .where(
          and(
            eq(schema.backupSchedules.enabled, true),
            or(
              isNull(schema.backupSchedules.nextRunAt),
              lte(schema.backupSchedules.nextRunAt, now),
            ),
          ),
        );

      for (const schedule of due) {
        try {
          await runSchedule({ db: options.db, env: options.env, now, schedule });
        } catch (error) {
          reportError(error, { scheduleId: schedule.id });
        }
      }
    } catch (error) {
      reportError(error, {});
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);

  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    tick,
  };
}

async function runSchedule({
  db,
  env,
  now,
  schedule,
}: {
  db: ControlPlaneDb;
  env: ApiEnv;
  now: Date;
  schedule: typeof schema.backupSchedules.$inferSelect;
}) {
  const isFirstRun = schedule.nextRunAt === null;

  if (isFirstRun) {
    const nextRunAt =
      computeNextRun(schedule.cronExpression, schedule.timezone, now) ?? now;
    await db
      .update(schema.backupSchedules)
      .set({ nextRunAt, updatedAt: new Date() })
      .where(eq(schema.backupSchedules.id, schedule.id));
    return;
  }

  const backup = {
    branchId: schedule.branchId,
    clusterId: schedule.clusterId,
    id: createId("backup_job"),
    pathPrefix: schedule.pathPrefix,
    s3DestinationId: schedule.s3DestinationId,
    scheduleId: schedule.id,
    status: "queued" as const,
  };

  await db.insert(schema.backupJobs).values(backup);

  const nextRunAt =
    computeNextRun(schedule.cronExpression, schedule.timezone, now) ?? null;

  await db
    .update(schema.backupSchedules)
    .set({
      lastRunAt: now,
      nextRunAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.backupSchedules.id, schedule.id));

  try {
    await startControlPlaneWorkflow({
      env,
      name: workflowNames.createBackup,
      payload: {
        backupJobId: backup.id,
        branchId: backup.branchId,
        clusterId: backup.clusterId,
        pathPrefix: backup.pathPrefix,
        s3DestinationId: backup.s3DestinationId,
      },
      workflowId: `backup-${backup.id}`,
    });
  } catch (error) {
    if (error instanceof WorkflowDispatchError) {
      await db
        .update(schema.backupJobs)
        .set({
          errorMessage:
            "Scheduler could not start backup workflow; job recorded but not dispatched.",
          finishedAt: new Date(),
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(schema.backupJobs.id, backup.id))
        .catch(() => undefined);
      return;
    }
    throw error;
  }
}

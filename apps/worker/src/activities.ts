import { Context } from "@temporalio/activity";
import type {
  CloneBranchInput,
  CreateBackupInput,
  ProvisionClusterInput,
  ProvisionWorkloadInput,
  RestoreBackupInput,
  RotateCredentialsInput,
} from "@openbika/contracts";
import { createDb, createPool, schema } from "@openbika/db";
import { createId } from "@openbika/domain";
import { parseEnv, workerEnvSchema } from "@openbika/env";
import {
  type BackupArtifact,
  type BackupS3Destination,
  type CloneBranchResult,
  type CreateBackupContext,
  type DataPlaneProvider,
  LocalDataPlaneProvider,
  parseBackupArtifactUri,
  type PostgresContainerLookup,
  type PostgresExecTarget,
  type ProvisionedCluster,
  type ProvisionedWorkload,
  type RestoreBackupContext,
  type RestoreResult,
  type RotatedCredentials,
} from "@openbika/provisioning";
import { and, desc, eq, notInArray } from "drizzle-orm";

const provider: DataPlaneProvider = new LocalDataPlaneProvider();
const env = parseEnv(workerEnvSchema);
const db = createDb(env.DATABASE_URL);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

type ActivityLogEntry = { at: string; message: string };

const ACTIVITY_LOG_CAP = 200;

function mergeObservedPayload(observed: unknown): Record<string, unknown> {
  if (observed && typeof observed === "object" && !Array.isArray(observed)) {
    return { ...(observed as Record<string, unknown>) };
  }
  return {};
}

function normalizeActivityLog(raw: unknown): ActivityLogEntry[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const out: ActivityLogEntry[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      !Array.isArray(item) &&
      "at" in item &&
      "message" in item &&
      typeof (item as { at: unknown }).at === "string" &&
      typeof (item as { message: unknown }).message === "string"
    ) {
      out.push({
        at: (item as ActivityLogEntry).at,
        message: (item as ActivityLogEntry).message,
      });
    }
  }
  return out;
}

function appendActivityLog(
  observed: Record<string, unknown>,
  message: string,
): Record<string, unknown> {
  const log = [
    ...normalizeActivityLog(observed.activityLog),
    { at: new Date().toISOString(), message },
  ];
  while (log.length > ACTIVITY_LOG_CAP) {
    log.shift();
  }
  return { ...observed, activityLog: log };
}

function localBranchToken(branchId: string) {
  return branchId
    .replace(/^br_/, "")
    .replaceAll("-", "")
    .slice(-12)
    .toLowerCase();
}

function localBranchDatabaseName(branchId: string) {
  return `openbika_${localBranchToken(branchId)}`;
}

function legacyLocalBranchDatabaseName(branchId: string) {
  const token = branchId
    .replace(/^br_/, "")
    .replaceAll("-", "")
    .slice(0, 12)
    .toLowerCase();

  return `openbika_${token}`;
}

function localBranchDatabaseNameCandidates(branchId: string) {
  const preferred = localBranchDatabaseName(branchId);
  const legacy = legacyLocalBranchDatabaseName(branchId);

  return preferred === legacy ? [preferred] : [preferred, legacy];
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function localBranchCredentials(branchId: string) {
  const databaseName = localBranchDatabaseName(branchId);
  const token = localBranchToken(branchId);

  return {
    databaseName,
    password: `bpg_${token}`,
    username: `${databaseName}_owner`,
  };
}

function connectionStringForDatabase(
  connectionString: string,
  databaseName: string,
) {
  const url = new URL(connectionString);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function terminateLocalDatabaseConnections(databaseName: string) {
  const pool = createPool(env.DATABASE_URL);
  const client = await pool.connect();

  try {
    await client.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName],
    );
  } finally {
    client.release();
    await pool.end();
  }
}

async function ensureLocalBranchDatabase(branchId: string) {
  const { databaseName, password, username } = localBranchCredentials(branchId);
  const lockKey = `openbika:branch:${branchId}`;
  const pool = createPool(env.DATABASE_URL);
  const client = await pool.connect();
  let acquiredLock = false;

  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [lockKey]);
    acquiredLock = true;

    const roleExists = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_roles where rolname = $1)",
      [username],
    );

    if (!roleExists.rows[0]?.exists) {
      await client.query(
        `create role ${quoteIdentifier(username)} login password ${quoteLiteral(
          password,
        )}`,
      );
    } else {
      await client.query(
        `alter role ${quoteIdentifier(username)} login password ${quoteLiteral(
          password,
        )}`,
      );
    }

    const databaseExists = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_database where datname = $1)",
      [databaseName],
    );

    if (!databaseExists.rows[0]?.exists) {
      await client.query(
        `create database ${quoteIdentifier(databaseName)} owner ${quoteIdentifier(
          username,
        )}`,
      );
    }
  } finally {
    if (acquiredLock) {
      await client
        .query("select pg_advisory_unlock(hashtext($1))", [lockKey])
        .catch(() => undefined);
    }
    client.release();
    await pool.end();
  }
}

async function resolveLocalBranchDatabaseName(branchId: string) {
  const candidates = localBranchDatabaseNameCandidates(branchId);
  const pool = createPool(env.DATABASE_URL);
  const client = await pool.connect();

  try {
    for (const candidate of candidates) {
      const databaseExists = await client.query<{ exists: boolean }>(
        "select exists(select 1 from pg_database where datname = $1)",
        [candidate],
      );

      if (databaseExists.rows[0]?.exists) {
        return candidate;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  await ensureLocalBranchDatabase(branchId);
  return localBranchDatabaseName(branchId);
}

async function requireLocalBranchDatabaseName(branchId: string) {
  const candidates = localBranchDatabaseNameCandidates(branchId);
  const pool = createPool(env.DATABASE_URL);
  const client = await pool.connect();

  try {
    for (const candidate of candidates) {
      const databaseExists = await client.query<{ exists: boolean }>(
        "select exists(select 1 from pg_database where datname = $1)",
        [candidate],
      );

      if (databaseExists.rows[0]?.exists) {
        return candidate;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }

  throw new Error(
    "Parent branch database does not exist yet. Open the parent branch or run a query on it before cloning.",
  );
}

async function truncateLocalBranchData(branchId: string) {
  const databaseName = await resolveLocalBranchDatabaseName(branchId);
  const pool = createPool(
    connectionStringForDatabase(env.DATABASE_URL, databaseName),
  );
  const client = await pool.connect();

  try {
    const tables = await client.query<{
      tableName: string;
      tableSchema: string;
    }>(
      `
        select table_schema as "tableSchema", table_name as "tableName"
        from information_schema.tables
        where table_type = 'BASE TABLE'
          and table_schema not in ('information_schema', 'pg_catalog')
          and table_schema not like 'pg_toast%'
      `,
    );

    if (tables.rows.length === 0) {
      return;
    }

    const tableList = tables.rows
      .map(
        (table) =>
          `${quoteIdentifier(table.tableSchema)}.${quoteIdentifier(
            table.tableName,
          )}`,
      )
      .join(", ");

    await client.query(`truncate table ${tableList} restart identity cascade`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function assignLocalBranchOwnership({
  sourceDatabaseName,
  targetDatabaseName,
  targetUsername,
}: {
  sourceDatabaseName: string;
  targetDatabaseName: string;
  targetUsername: string;
}) {
  const sourceUsername = `${sourceDatabaseName}_owner`;
  const pool = createPool(
    connectionStringForDatabase(env.DATABASE_URL, targetDatabaseName),
  );
  const client = await pool.connect();

  try {
    await client.query(
      `alter schema public owner to ${quoteIdentifier(targetUsername)}`,
    );
    await client.query(
      `grant usage, create on schema public to ${quoteIdentifier(
        targetUsername,
      )}`,
    );

    const sourceRoleExists = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_roles where rolname = $1)",
      [sourceUsername],
    );

    if (sourceRoleExists.rows[0]?.exists) {
      await client.query(
        `reassign owned by ${quoteIdentifier(sourceUsername)} to ${quoteIdentifier(
          targetUsername,
        )}`,
      );
    }

    await client.query(
      `grant all privileges on all tables in schema public to ${quoteIdentifier(
        targetUsername,
      )}`,
    );
    await client.query(
      `grant all privileges on all sequences in schema public to ${quoteIdentifier(
        targetUsername,
      )}`,
    );
    await client.query(
      `alter default privileges in schema public grant all on tables to ${quoteIdentifier(
        targetUsername,
      )}`,
    );
    await client.query(
      `alter default privileges in schema public grant all on sequences to ${quoteIdentifier(
        targetUsername,
      )}`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

async function cloneLocalBranchDatabase(input: CloneBranchInput) {
  const sourceDatabaseName = await requireLocalBranchDatabaseName(
    input.sourceBranchId,
  );
  const targetCredentials = localBranchCredentials(input.targetBranchId);
  const pool = createPool(env.DATABASE_URL);
  const client = await pool.connect();

  try {
    const roleExists = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_roles where rolname = $1)",
      [targetCredentials.username],
    );

    if (!roleExists.rows[0]?.exists) {
      await client.query(
        `create role ${quoteIdentifier(
          targetCredentials.username,
        )} login password ${quoteLiteral(targetCredentials.password)}`,
      );
    } else {
      await client.query(
        `alter role ${quoteIdentifier(
          targetCredentials.username,
        )} login password ${quoteLiteral(targetCredentials.password)}`,
      );
    }
  } finally {
    client.release();
    await pool.end();
  }

  await terminateLocalDatabaseConnections(targetCredentials.databaseName);
  await terminateLocalDatabaseConnections(sourceDatabaseName);

  const clonePool = createPool(env.DATABASE_URL);
  const cloneClient = await clonePool.connect();

  try {
    await cloneClient.query(
      `drop database if exists ${quoteIdentifier(targetCredentials.databaseName)}`,
    );
    await cloneClient.query(
      `create database ${quoteIdentifier(
        targetCredentials.databaseName,
      )} with template ${quoteIdentifier(sourceDatabaseName)} owner ${quoteIdentifier(
        targetCredentials.username,
      )}`,
    );
  } finally {
    cloneClient.release();
    await clonePool.end();
  }

  await assignLocalBranchOwnership({
    sourceDatabaseName,
    targetDatabaseName: targetCredentials.databaseName,
    targetUsername: targetCredentials.username,
  });

  if (input.copyMode === "schema_only") {
    await truncateLocalBranchData(input.targetBranchId);
  }
}

export async function provisionClusterActivity(
  input: ProvisionClusterInput,
): Promise<ProvisionedCluster> {
  Context.current().log.info("Provisioning cluster", {
    clusterId: input.clusterId,
    provider: input.provider,
  });

  const bootstrap = (
    await db
      .select({ observedState: schema.databaseClusters.observedState })
      .from(schema.databaseClusters)
      .where(eq(schema.databaseClusters.id, input.clusterId))
      .limit(1)
  )[0];

  await db
    .update(schema.databaseClusters)
    .set({
      observedState: appendActivityLog(
        mergeObservedPayload(bootstrap?.observedState),
        "Cluster provisioning started (control plane)",
      ),
      status: "provisioning",
      updatedAt: new Date(),
    })
    .where(eq(schema.databaseClusters.id, input.clusterId));

  try {
    const result = await provider.provisionCluster(input);
    const mainBranch = (
      await db
        .select()
        .from(schema.branches)
        .where(
          and(
            eq(schema.branches.clusterId, input.clusterId),
            eq(schema.branches.name, "main"),
          ),
        )
        .limit(1)
    )[0];

    await db.transaction(async (tx) => {
      const current = (
        await tx
          .select({
            observedState: schema.databaseClusters.observedState,
          })
          .from(schema.databaseClusters)
          .where(eq(schema.databaseClusters.id, input.clusterId))
          .limit(1)
      )[0];

      const merged = appendActivityLog(
        mergeObservedPayload(current?.observedState),
        `Cluster endpoint ready at ${result.endpoint.hostname}:${result.endpoint.port}`,
      );

      await tx
        .update(schema.databaseClusters)
        .set({
          observedState: {
            ...merged,
            error: undefined,
            providerResourceId: result.providerResourceId,
          },
          status: "available",
          updatedAt: new Date(),
        })
        .where(eq(schema.databaseClusters.id, input.clusterId));

      if (mainBranch) {
        await tx
          .update(schema.branches)
          .set({
            status: "ready",
            updatedAt: new Date(),
          })
          .where(eq(schema.branches.id, mainBranch.id));
      }

      await tx
        .insert(schema.endpoints)
        .values({
          branchId: mainBranch?.id ?? null,
          clusterId: input.clusterId,
          hostname: result.endpoint.hostname,
          id: createId("endpoint"),
          poolerMode: result.endpoint.poolerMode,
          port: result.endpoint.port,
        })
        .onConflictDoUpdate({
          set: {
            branchId: mainBranch?.id ?? null,
            poolerMode: result.endpoint.poolerMode,
            port: result.endpoint.port,
            updatedAt: new Date(),
          },
          target: [
            schema.endpoints.clusterId,
            schema.endpoints.hostname,
            schema.endpoints.port,
          ],
        });
    });

    return result;
  } catch (error) {
    const current = (
      await db
        .select({ observedState: schema.databaseClusters.observedState })
        .from(schema.databaseClusters)
        .where(eq(schema.databaseClusters.id, input.clusterId))
        .limit(1)
    )[0];
    const merged = appendActivityLog(
      mergeObservedPayload(current?.observedState),
      `Cluster provisioning failed: ${errorMessage(error)}`,
    );

    await db
      .update(schema.databaseClusters)
      .set({
        observedState: {
          ...merged,
          error: errorMessage(error),
        },
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.databaseClusters.id, input.clusterId));

    throw error;
  }
}

export async function provisionWorkloadActivity(
  input: ProvisionWorkloadInput,
): Promise<ProvisionedWorkload> {
  Context.current().log.info("Provisioning workload", {
    kind: input.kind,
    provider: input.provider,
    workloadId: input.workloadId,
  });

  const bootstrap = (
    await db
      .select({ observedState: schema.projectWorkloads.observedState })
      .from(schema.projectWorkloads)
      .where(eq(schema.projectWorkloads.id, input.workloadId))
      .limit(1)
  )[0];

  await db
    .update(schema.projectWorkloads)
    .set({
      observedState: appendActivityLog(
        mergeObservedPayload(bootstrap?.observedState),
        "Workload provisioning started (control plane)",
      ),
      status: "provisioning",
      updatedAt: new Date(),
    })
    .where(eq(schema.projectWorkloads.id, input.workloadId));

  try {
    const result = await provider.provisionWorkload(input);
    const existing = (
      await db
        .select({ observedState: schema.projectWorkloads.observedState })
        .from(schema.projectWorkloads)
        .where(eq(schema.projectWorkloads.id, input.workloadId))
        .limit(1)
    )[0];
    const previous = mergeObservedPayload(existing?.observedState);
    const invoked = appendActivityLog(
      previous,
      `Invoked data plane provider (${input.provider})`,
    );

    await db
      .update(schema.projectWorkloads)
      .set({
        observedState: appendActivityLog(
          {
            ...invoked,
            error: undefined,
            providerResourceId: result.providerResourceId,
            ...(Array.isArray(result.ingressRoutes) &&
            result.ingressRoutes.length > 0
              ? { ingressRoutes: result.ingressRoutes }
              : {}),
            ...(result.publicBaseUrl
              ? { publicBaseUrl: result.publicBaseUrl }
              : {}),
            ...(result.dockerContainerId
              ? { dockerContainerId: result.dockerContainerId }
              : {}),
            ...(result.dockerContainerName
              ? { dockerContainerName: result.dockerContainerName }
              : {}),
          },
          "Workload provisioning completed",
        ),
        status: "available",
        updatedAt: new Date(),
      })
      .where(eq(schema.projectWorkloads.id, input.workloadId));

    return result;
  } catch (error) {
    const existing = (
      await db
        .select({ observedState: schema.projectWorkloads.observedState })
        .from(schema.projectWorkloads)
        .where(eq(schema.projectWorkloads.id, input.workloadId))
        .limit(1)
    )[0];
    const previous = mergeObservedPayload(existing?.observedState);
    const withFailureLog = appendActivityLog(
      previous,
      `Workload provisioning failed: ${errorMessage(error)}`,
    );

    await db
      .update(schema.projectWorkloads)
      .set({
        observedState: {
          ...withFailureLog,
          error: errorMessage(error),
        },
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.projectWorkloads.id, input.workloadId));

    throw error;
  }
}

export async function cloneBranchActivity(
  input: CloneBranchInput,
): Promise<CloneBranchResult> {
  Context.current().log.info("Cloning branch", {
    copyMode: input.copyMode,
    sourceBranchId: input.sourceBranchId,
    targetBranchId: input.targetBranchId,
  });

  await db
    .update(schema.branches)
    .set({
      status: "creating",
      updatedAt: new Date(),
    })
    .where(eq(schema.branches.id, input.targetBranchId));

  try {
    if (input.provider === "local") {
      await cloneLocalBranchDatabase(input);
    }

    const result = await provider.cloneBranch(input);

    await db
      .update(schema.branches)
      .set({
        status: "ready",
        updatedAt: new Date(),
      })
      .where(eq(schema.branches.id, input.targetBranchId));

    return result;
  } catch (error) {
    await db
      .update(schema.branches)
      .set({
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.branches.id, input.targetBranchId));

    throw error;
  }
}

async function loadBackupContext(input: CreateBackupInput): Promise<{
  branchDatabaseName: string | null;
  branchId: string | null;
  destination: BackupS3Destination | null;
  pathPrefix: string | null;
  postgresExec: PostgresExecTarget | null;
  scheduleId: string | null;
}> {
  const job = (
    await db
      .select()
      .from(schema.backupJobs)
      .where(eq(schema.backupJobs.id, input.backupJobId))
      .limit(1)
  )[0];

  if (!job) {
    return {
      branchDatabaseName: null,
      branchId: null,
      destination: null,
      pathPrefix: null,
      postgresExec: null,
      scheduleId: null,
    };
  }

  const branchId = job.branchId ?? input.branchId ?? null;
  const destinationId = job.s3DestinationId ?? input.s3DestinationId ?? null;
  const pathPrefix = job.pathPrefix ?? input.pathPrefix ?? null;

  let branchDatabaseName: string | null = null;
  let postgresExec: PostgresExecTarget | null = null;
  if (branchId) {
    try {
      branchDatabaseName = await resolveLocalBranchDatabaseName(branchId);
      postgresExec = buildPostgresExecTarget(branchId);
    } catch {
      branchDatabaseName = null;
      postgresExec = null;
    }
  }

  let destination: BackupS3Destination | null = null;
  if (destinationId) {
    const row = (
      await db
        .select()
        .from(schema.s3Destinations)
        .where(eq(schema.s3Destinations.id, destinationId))
        .limit(1)
    )[0];

    if (row) {
      destination = {
        accessKey: row.accessKey,
        additionalFlags: row.additionalFlags,
        bucket: row.bucket,
        endpoint: row.endpoint,
        region: row.region,
        secretAccessKey: row.secretAccessKey,
      };
    }
  }

  return {
    branchDatabaseName,
    branchId,
    destination,
    pathPrefix,
    postgresExec,
    scheduleId: job.scheduleId,
  };
}

/**
 * Locate the running Postgres container we should `docker exec` into for
 * `pg_dump`. By default we use the compose service label so it works with
 * the bundled `infra/docker/docker-compose.yml`. Operators can override via
 * `OPENBIKA_POSTGRES_CONTAINER` when they manage Postgres themselves.
 */
function resolvePostgresContainerLookup(): PostgresContainerLookup {
  const override = process.env.OPENBIKA_POSTGRES_CONTAINER;
  if (override && override.trim().length > 0) {
    return { kind: "name", value: override.trim() };
  }

  const labelKey =
    process.env.OPENBIKA_POSTGRES_CONTAINER_LABEL_KEY ??
    "com.docker.compose.service";
  const labelValue =
    process.env.OPENBIKA_POSTGRES_CONTAINER_LABEL_VALUE ?? "postgres";
  return { kind: "label", key: labelKey, value: labelValue };
}

function buildPostgresExecTarget(branchId: string): PostgresExecTarget {
  const credentials = localBranchCredentials(branchId);
  return {
    containerLookup: resolvePostgresContainerLookup(),
    database: credentials.databaseName,
    password: credentials.password,
    username: credentials.username,
  };
}

/**
 * Apply a schedule's `retentionKeepLast` policy by deleting succeeded jobs
 * older than the most recent N. Failed/queued/running jobs are left untouched
 * so operators can inspect them.
 */
async function applyScheduleRetention(scheduleId: string) {
  const schedule = (
    await db
      .select()
      .from(schema.backupSchedules)
      .where(eq(schema.backupSchedules.id, scheduleId))
      .limit(1)
  )[0];

  if (!schedule || schedule.retentionKeepLast === null) return;
  const keep = schedule.retentionKeepLast;
  if (keep < 1) return;

  const survivors = await db
    .select({ id: schema.backupJobs.id })
    .from(schema.backupJobs)
    .where(
      and(
        eq(schema.backupJobs.scheduleId, scheduleId),
        eq(schema.backupJobs.status, "succeeded"),
      ),
    )
    .orderBy(desc(schema.backupJobs.createdAt))
    .limit(keep);

  const keepIds = survivors.map((row) => row.id);
  if (keepIds.length === 0) return;

  await db
    .delete(schema.backupJobs)
    .where(
      and(
        eq(schema.backupJobs.scheduleId, scheduleId),
        eq(schema.backupJobs.status, "succeeded"),
        notInArray(schema.backupJobs.id, keepIds),
      ),
    );
}

export async function createBackupActivity(
  input: CreateBackupInput,
): Promise<BackupArtifact> {
  Context.current().log.info("Creating cluster backup", {
    backupJobId: input.backupJobId,
    clusterId: input.clusterId,
  });

  await db
    .update(schema.backupJobs)
    .set({
      startedAt: new Date(),
      status: "running",
      updatedAt: new Date(),
    })
    .where(eq(schema.backupJobs.id, input.backupJobId));

  try {
    const loaded = await loadBackupContext(input);
    const context: CreateBackupContext = {
      branchDatabaseName: loaded.branchDatabaseName,
      branchId: loaded.branchId,
      destination: loaded.destination,
      pathPrefix: loaded.pathPrefix,
      postgresExec: loaded.postgresExec,
    };
    const result = await provider.createBackup(input, context);

    await db
      .update(schema.backupJobs)
      .set({
        artifactUri: result.artifactUri,
        finishedAt: new Date(),
        status: "succeeded",
        updatedAt: new Date(),
      })
      .where(eq(schema.backupJobs.id, input.backupJobId));

    if (loaded.scheduleId) {
      try {
        await applyScheduleRetention(loaded.scheduleId);
      } catch (retentionError) {
        Context.current().log.warn("Backup retention pruning failed", {
          error:
            retentionError instanceof Error
              ? retentionError.message
              : "Unknown error",
          scheduleId: loaded.scheduleId,
        });
      }
    }

    return result;
  } catch (error) {
    await db
      .update(schema.backupJobs)
      .set({
        errorMessage: errorMessage(error),
        finishedAt: new Date(),
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.backupJobs.id, input.backupJobId));

    throw error;
  }
}

/**
 * Reset the target branch's local Postgres database before restoring. For
 * existing branches we drop and recreate the database (the simplest way to
 * guarantee a clean canvas for `pg_restore`); for new branches we just make
 * sure the database/role exist.
 */
async function prepareTargetDatabaseForRestore(branchId: string) {
  const credentials = localBranchCredentials(branchId);
  await terminateLocalDatabaseConnections(credentials.databaseName);
  const pool = createPool(env.DATABASE_URL);
  const client = await pool.connect();
  try {
    const roleExists = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_roles where rolname = $1)",
      [credentials.username],
    );
    if (!roleExists.rows[0]?.exists) {
      await client.query(
        `create role ${quoteIdentifier(credentials.username)} login password ${quoteLiteral(credentials.password)}`,
      );
    } else {
      await client.query(
        `alter role ${quoteIdentifier(credentials.username)} login password ${quoteLiteral(credentials.password)}`,
      );
    }

    await client.query(
      `drop database if exists ${quoteIdentifier(credentials.databaseName)}`,
    );
    await client.query(
      `create database ${quoteIdentifier(credentials.databaseName)} owner ${quoteIdentifier(credentials.username)}`,
    );
  } finally {
    client.release();
    await pool.end();
  }
}

async function loadRestoreContext(
  input: RestoreBackupInput,
): Promise<RestoreBackupContext> {
  const backupJob = (
    await db
      .select()
      .from(schema.backupJobs)
      .where(eq(schema.backupJobs.id, input.backupJobId))
      .limit(1)
  )[0];

  if (!backupJob) {
    throw new Error(
      `Backup job not found: ${input.backupJobId}. Cannot restore.`,
    );
  }
  if (backupJob.status !== "succeeded" || !backupJob.artifactUri) {
    throw new Error(
      `Backup job ${input.backupJobId} has no successful artifact to restore (status=${backupJob.status}).`,
    );
  }

  const source = parseBackupArtifactUri(backupJob.artifactUri);
  if (!source) {
    throw new Error(
      `Cannot restore: artifact URI is not an S3 object (${backupJob.artifactUri}). Local placeholders cannot be restored.`,
    );
  }

  let destination: BackupS3Destination | null = null;
  if (backupJob.s3DestinationId) {
    const row = (
      await db
        .select()
        .from(schema.s3Destinations)
        .where(eq(schema.s3Destinations.id, backupJob.s3DestinationId))
        .limit(1)
    )[0];
    if (row) {
      destination = {
        accessKey: row.accessKey,
        additionalFlags: row.additionalFlags,
        bucket: row.bucket,
        endpoint: row.endpoint,
        region: row.region,
        secretAccessKey: row.secretAccessKey,
      };
    }
  }

  if (!destination) {
    throw new Error(
      "Cannot restore: the S3 destination this backup was uploaded to is no longer configured.",
    );
  }

  return {
    destination,
    postgresExec: buildPostgresExecTarget(input.targetBranchId),
    source,
  };
}

export async function restoreBackupActivity(
  input: RestoreBackupInput,
): Promise<RestoreResult> {
  Context.current().log.info("Restoring cluster backup", {
    backupJobId: input.backupJobId,
    mode: input.mode,
    restoreJobId: input.restoreJobId,
    targetBranchId: input.targetBranchId,
  });

  await db
    .update(schema.restoreJobs)
    .set({
      startedAt: new Date(),
      status: "running",
      updatedAt: new Date(),
    })
    .where(eq(schema.restoreJobs.id, input.restoreJobId));

  try {
    await prepareTargetDatabaseForRestore(input.targetBranchId);
    const context = await loadRestoreContext(input);
    const result = await provider.restoreBackup(input, context);

    await db.transaction(async (tx) => {
      await tx
        .update(schema.restoreJobs)
        .set({
          finishedAt: new Date(),
          status: "succeeded",
          updatedAt: new Date(),
        })
        .where(eq(schema.restoreJobs.id, input.restoreJobId));
      await tx
        .update(schema.branches)
        .set({
          status: "ready",
          updatedAt: new Date(),
        })
        .where(eq(schema.branches.id, input.targetBranchId));
    });

    return result;
  } catch (error) {
    await db.transaction(async (tx) => {
      await tx
        .update(schema.restoreJobs)
        .set({
          errorMessage: errorMessage(error),
          finishedAt: new Date(),
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(schema.restoreJobs.id, input.restoreJobId));
      await tx
        .update(schema.branches)
        .set({
          status: "failed",
          updatedAt: new Date(),
        })
        .where(eq(schema.branches.id, input.targetBranchId));
    });

    throw error;
  }
}

export async function rotateCredentialsActivity(
  input: RotateCredentialsInput,
): Promise<RotatedCredentials> {
  Context.current().log.info("Rotating cluster credentials", {
    clusterId: input.clusterId,
    roleName: input.roleName,
  });

  return provider.rotateCredentials(input);
}

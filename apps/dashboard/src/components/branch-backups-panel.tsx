import {
  type BackupJobResponse,
  type BackupScheduleResponse,
  type BranchResponse,
  type CreateBackupRequest,
  type CreateBackupScheduleRequest,
  type CreateRestoreRequest,
  type JobStatus,
  type PatchBackupScheduleRequest,
  type RestoreMode,
  type S3DestinationResponse,
} from "@openbika/contracts";
import { Badge } from "@openbika/ui/components/badge";
import { Button } from "@openbika/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { Input } from "@openbika/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@openbika/ui/components/table";
import { cn } from "@openbika/ui/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Clock,
  Copy,
  Database,
  ExternalLink,
  Eye,
  Pause,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import * as React from "react";

import {
  createBackupScheduleRequest,
  createDatabaseBackupRequest,
  createRestoreRequest,
  dashboardKeys,
  deleteBackupScheduleRequest,
  fetchBackupSchedules,
  fetchDatabaseBackups,
  fetchOrganizations,
  fetchS3Destinations,
  patchBackupScheduleRequest,
} from "#/lib/dashboard-api-queries";

const selectClassName = cn(
  "flex h-9 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow]",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
);

const labelClassName =
  "text-muted-foreground text-xs font-medium uppercase tracking-wide";

interface CronPreset {
  description: string;
  expression: string;
  label: string;
}

const cronPresets: CronPreset[] = [
  {
    description: "Runs at the start of every hour.",
    expression: "0 * * * *",
    label: "Hourly",
  },
  {
    description: "Runs every 6 hours, on the hour.",
    expression: "0 */6 * * *",
    label: "Every 6 hours",
  },
  {
    description: "Runs daily at 03:00 in the chosen timezone.",
    expression: "0 3 * * *",
    label: "Daily at 03:00",
  },
  {
    description: "Runs every Sunday at 03:00.",
    expression: "0 3 * * 0",
    label: "Weekly (Sun 03:00)",
  },
  {
    description: "Runs the 1st of each month at 03:00.",
    expression: "0 3 1 * *",
    label: "Monthly (1st 03:00)",
  },
];

const customCronValue = "__custom__";

function cronOptionFor(expression: string): {
  isCustom: boolean;
  selectValue: string;
} {
  const preset = cronPresets.find((p) => p.expression === expression);
  if (preset) {
    return { isCustom: false, selectValue: preset.expression };
  }
  return { isCustom: true, selectValue: customCronValue };
}

const jobsRefetchInterval = (query: { state: { data?: BackupJobResponse[] } }) => {
  const list = query.state.data;
  if (!list) return false;
  const active = list.some(
    (job) => job.status === "queued" || job.status === "running",
  );
  return active ? 3_000 : false;
};

interface BranchBackupsPanelProps {
  branchId: string;
  branchName: string;
  branches: BranchResponse[];
  databaseId: string;
  organizationSlug: string;
}

export function BranchBackupsPanel({
  branchId,
  branchName,
  branches,
  databaseId,
  organizationSlug,
}: BranchBackupsPanelProps) {
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: dashboardKeys.organizations(),
    queryFn: fetchOrganizations,
  });
  const organizationId =
    orgsQuery.data?.find((o) => o.slug === organizationSlug)?.id ?? null;

  const destinationsQuery = useQuery({
    enabled: organizationId !== null,
    queryFn: () => fetchS3Destinations(organizationId as string),
    queryKey: dashboardKeys.s3Destinations(organizationId ?? ""),
  });

  const backupsQuery = useQuery({
    queryFn: () => fetchDatabaseBackups(databaseId, branchId),
    queryKey: dashboardKeys.databaseBackups(databaseId, branchId),
    refetchInterval: jobsRefetchInterval,
  });

  const schedulesQuery = useQuery({
    queryFn: () => fetchBackupSchedules(databaseId, branchId),
    queryKey: dashboardKeys.backupSchedules(databaseId, branchId),
  });

  const destinations = destinationsQuery.data ?? [];
  const backups = backupsQuery.data ?? [];
  const schedules = schedulesQuery.data ?? [];

  const [runDialogOpen, setRunDialogOpen] = React.useState(false);
  const [restoreError, setRestoreError] = React.useState<string | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = React.useState(false);
  const [editingSchedule, setEditingSchedule] =
    React.useState<BackupScheduleResponse | null>(null);
  const [viewingBackupId, setViewingBackupId] = React.useState<string | null>(
    null,
  );
  const [restoreJobId, setRestoreJobId] = React.useState<string | null>(null);

  const restoreMut = useMutation({
    mutationFn: async (input: {
      backupJobId: string;
      payload: CreateRestoreRequest;
    }) => createRestoreRequest(input.backupJobId, input.payload),
    onError: (error) => {
      setRestoreError(
        error instanceof Error ? error.message : "Restore failed",
      );
    },
    onSuccess: async () => {
      setRestoreError(null);
      setRestoreJobId(null);
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.databaseBackups(databaseId, branchId),
      });
    },
  });

  const deleteScheduleMut = useMutation({
    mutationFn: async (scheduleId: string) =>
      deleteBackupScheduleRequest(scheduleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.backupSchedules(databaseId, branchId),
      });
    },
  });

  const toggleScheduleMut = useMutation({
    mutationFn: async (input: { enabled: boolean; scheduleId: string }) =>
      patchBackupScheduleRequest(input.scheduleId, {
        enabled: input.enabled,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.backupSchedules(databaseId, branchId),
      });
    },
  });

  function openRestoreDialog(job: BackupJobResponse) {
    setRestoreError(null);
    setRestoreJobId(job.id);
  }

  const restoringBackup = restoreJobId
    ? (backups.find((b) => b.id === restoreJobId) ?? null)
    : null;

  const viewingBackup = viewingBackupId
    ? (backups.find((b) => b.id === viewingBackupId) ?? null)
    : null;
  const viewingDestination =
    viewingBackup && viewingBackup.s3DestinationId
      ? (destinations.find((d) => d.id === viewingBackup.s3DestinationId) ??
        null)
      : null;

  function openCreateScheduleDialog() {
    setEditingSchedule(null);
    setScheduleDialogOpen(true);
  }

  function openEditScheduleDialog(schedule: BackupScheduleResponse) {
    setEditingSchedule(schedule);
    setScheduleDialogOpen(true);
  }

  const noDestinations = destinations.length === 0;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Database className="text-muted-foreground size-4" />
              Backups
            </CardTitle>
            <CardDescription>
              On-demand and scheduled backups for the{" "}
              <span className="font-medium text-foreground">{branchName}</span>{" "}
              branch.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              className="text-muted-foreground text-sm underline-offset-2 hover:text-foreground hover:underline"
              params={{ organizationSlug }}
              to="/$organizationSlug/destinations"
            >
              Manage destinations
            </Link>
            <Button
              onClick={() => setRunDialogOpen(true)}
              size="sm"
              type="button"
            >
              Run backup
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          {noDestinations ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-4 text-sm">
              <p className="font-medium text-foreground">
                No destinations configured
              </p>
              <p className="mt-1 text-muted-foreground">
                Add an S3-compatible destination so backups can be uploaded.
                Without one, jobs will store a local placeholder URI.
              </p>
            </div>
          ) : null}

          <BackupJobsTable
            backups={backups}
            destinations={destinations}
            isLoading={backupsQuery.isPending}
            onRestore={openRestoreDialog}
            onView={(job) => setViewingBackupId(job.id)}
            restorePending={restoreMut.isPending}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Clock className="text-muted-foreground size-4" />
              Schedules
            </CardTitle>
            <CardDescription>
              Recurring backups for this branch, delivered to the chosen
              destination on a cron cadence.
            </CardDescription>
          </div>
          <Button
            className="self-start gap-1.5"
            disabled={noDestinations}
            onClick={openCreateScheduleDialog}
            size="sm"
            type="button"
          >
            <Plus className="size-4" />
            New schedule
          </Button>
        </CardHeader>
        <CardContent>
          <BackupSchedulesTable
            destinations={destinations}
            onDelete={(scheduleId) => deleteScheduleMut.mutate(scheduleId)}
            onEdit={openEditScheduleDialog}
            onToggle={(schedule) =>
              toggleScheduleMut.mutate({
                enabled: !schedule.enabled,
                scheduleId: schedule.id,
              })
            }
            schedules={schedules}
            togglePending={toggleScheduleMut.isPending}
          />
        </CardContent>
      </Card>

      <RunBackupDialog
        branchId={branchId}
        branchName={branchName}
        databaseId={databaseId}
        destinations={destinations}
        onOpenChange={setRunDialogOpen}
        open={runDialogOpen}
      />

      <BackupScheduleFormDialog
        branchId={branchId}
        branchName={branchName}
        databaseId={databaseId}
        destinations={destinations}
        onOpenChange={(open) => {
          setScheduleDialogOpen(open);
          if (!open) setEditingSchedule(null);
        }}
        open={scheduleDialogOpen}
        schedule={editingSchedule}
      />

      <BackupDetailsDialog
        destination={viewingDestination}
        job={viewingBackup}
        onOpenChange={(open) => {
          if (!open) setViewingBackupId(null);
        }}
        onRestore={(job) => {
          setViewingBackupId(null);
          openRestoreDialog(job);
        }}
        open={viewingBackup !== null}
        restorePending={restoreMut.isPending}
      />

      <RestoreBackupDialog
        branches={branches}
        defaultTargetBranchId={restoringBackup?.branchId ?? branchId}
        error={restoreError}
        job={restoringBackup}
        onOpenChange={(open) => {
          if (!open) {
            setRestoreJobId(null);
            setRestoreError(null);
          }
        }}
        onSubmit={(payload) => {
          if (!restoringBackup) return;
          restoreMut.mutate({ backupJobId: restoringBackup.id, payload });
        }}
        open={restoringBackup !== null}
        pending={restoreMut.isPending}
      />
    </div>
  );
}

function destinationOptionLabel(destination: S3DestinationResponse) {
  return `${destination.name} (${destination.bucket})`;
}

interface BackupJobsTableProps {
  backups: BackupJobResponse[];
  destinations: S3DestinationResponse[];
  isLoading: boolean;
  onRestore: (job: BackupJobResponse) => void;
  onView: (job: BackupJobResponse) => void;
  restorePending: boolean;
}

function BackupJobsTable({
  backups,
  destinations,
  isLoading,
  onRestore,
  onView,
  restorePending,
}: BackupJobsTableProps) {
  if (isLoading && backups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">Loading backup history…</p>
    );
  }

  if (backups.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No backups yet. Run one above to get started.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">Status</TableHead>
            <TableHead className="text-muted-foreground">Started</TableHead>
            <TableHead className="text-muted-foreground">Finished</TableHead>
            <TableHead className="text-muted-foreground">Destination</TableHead>
            <TableHead className="text-muted-foreground">Path</TableHead>
            <TableHead className="text-right text-muted-foreground">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {backups.map((job) => (
            <TableRow key={job.id}>
              <TableCell>
                <JobStatusBadge status={job.status} />
              </TableCell>
              <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                {formatTimestamp(job.startedAt ?? job.createdAt)}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                {job.finishedAt ? formatTimestamp(job.finishedAt) : "—"}
              </TableCell>
              <TableCell className="text-sm">
                {resolveDestinationName(job.s3DestinationId, destinations)}
              </TableCell>
              <TableCell className="max-w-[14rem] truncate font-mono text-muted-foreground text-xs">
                {job.pathPrefix ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    onClick={() => onView(job)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Eye className="size-3.5" />
                    View
                  </Button>
                  <Button
                    disabled={job.status !== "succeeded" || restorePending}
                    onClick={() => onRestore(job)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Restore
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface BackupDetailsDialogProps {
  destination: S3DestinationResponse | null;
  job: BackupJobResponse | null;
  onOpenChange: (open: boolean) => void;
  onRestore: (job: BackupJobResponse) => void;
  open: boolean;
  restorePending: boolean;
}

function BackupDetailsDialog({
  destination,
  job,
  onOpenChange,
  onRestore,
  open,
  restorePending,
}: BackupDetailsDialogProps) {
  const openUrl = job ? buildArtifactOpenUrl(job.artifactUri, destination) : null;

  async function copyArtifactUri() {
    if (!job?.artifactUri) return;
    try {
      await globalThis.navigator?.clipboard?.writeText(job.artifactUri);
    } catch {
      /* best-effort */
    }
  }

  return (
    <ModalShell
      description={job ? `Backup ${job.id}` : undefined}
      onOpenChange={onOpenChange}
      open={open}
      title="Backup details"
    >
      {job ? (
        <div className="space-y-4 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <DetailRow label="Status">
              <JobStatusBadge status={job.status} />
            </DetailRow>
            <DetailRow label="Destination">
              <span className="text-sm">
                {destination
                  ? destination.name
                  : job.s3DestinationId
                    ? "Unknown destination"
                    : "Local (no S3 destination)"}
              </span>
            </DetailRow>
            <DetailRow label="Started">
              <span className="text-muted-foreground text-sm">
                {formatTimestamp(job.startedAt ?? job.createdAt)}
              </span>
            </DetailRow>
            <DetailRow label="Finished">
              <span className="text-muted-foreground text-sm">
                {job.finishedAt ? formatTimestamp(job.finishedAt) : "—"}
              </span>
            </DetailRow>
            <DetailRow label="Path prefix">
              <span className="font-mono text-muted-foreground text-xs break-all">
                {job.pathPrefix ?? "—"}
              </span>
            </DetailRow>
            <DetailRow label="Schedule">
              <span className="font-mono text-muted-foreground text-xs break-all">
                {job.scheduleId ?? "Manual run"}
              </span>
            </DetailRow>
          </div>

          <div className="space-y-1.5">
            <p className={labelClassName}>Artifact URI</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-xs">
                {job.artifactUri ?? "—"}
              </code>
              <Button
                disabled={!job.artifactUri}
                onClick={copyArtifactUri}
                size="sm"
                type="button"
                variant="outline"
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>

          {job.errorMessage ? (
            <div className="space-y-1.5">
              <p className={labelClassName}>Error</p>
              <pre className="max-h-48 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 text-destructive text-xs whitespace-pre-wrap">
                {job.errorMessage}
              </pre>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-border border-t px-5 py-4">
        <Button
          onClick={() => onOpenChange(false)}
          type="button"
          variant="outline"
        >
          Close
        </Button>
        {openUrl !== null ? (
          <Button
            onClick={() => {
              globalThis.open(openUrl, "_blank", "noopener");
            }}
            type="button"
            variant="outline"
          >
            <ExternalLink className="size-3.5" />
            Open in destination
          </Button>
        ) : null}
        {job ? (
          <Button
            disabled={job.status !== "succeeded" || restorePending}
            onClick={() => onRestore(job)}
            type="button"
          >
            Restore
          </Button>
        ) : null}
      </div>
    </ModalShell>
  );
}

function DetailRow({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="space-y-1">
      <p className={labelClassName}>{label}</p>
      <div>{children}</div>
    </div>
  );
}

/**
 * Resolve a clickable HTTPS URL for a stored artifact:
 *  - `https://…` / `http://…` URIs pass through unchanged.
 *  - `s3://bucket/key?endpoint=ENC(...)` returns `<endpoint>/<bucket>/<key>`.
 *  - Anything else (e.g. `local://…`) returns null.
 */
function buildArtifactOpenUrl(
  artifactUri: string | null,
  destination: S3DestinationResponse | null,
): string | null {
  if (!artifactUri) return null;

  if (artifactUri.startsWith("http://") || artifactUri.startsWith("https://")) {
    return artifactUri;
  }

  if (artifactUri.startsWith("s3://")) {
    const withoutScheme = artifactUri.slice("s3://".length);
    const [hostPath, query] = withoutScheme.split("?", 2);
    if (!hostPath) return null;
    const slash = hostPath.indexOf("/");
    if (slash < 0) return null;
    const bucket = hostPath.slice(0, slash);
    const key = hostPath.slice(slash + 1);
    let endpoint = destination?.endpoint ?? "";
    if (query) {
      const params = new URLSearchParams(query);
      const fromQuery = params.get("endpoint");
      if (fromQuery) endpoint = fromQuery;
    }
    if (!endpoint) return null;
    const trimmed = endpoint.replace(/\/+$/, "");
    return `${trimmed}/${bucket}/${key}`;
  }

  return null;
}

function JobStatusBadge({ status }: { status: JobStatus }) {
  const variant = ((): "default" | "destructive" | "secondary" => {
    switch (status) {
      case "succeeded":
        return "default";
      case "failed":
      case "cancelled":
        return "destructive";
      case "queued":
      case "running":
      default:
        return "secondary";
    }
  })();
  return <Badge variant={variant}>{status}</Badge>;
}

function resolveDestinationName(
  destinationId: string | null,
  destinations: S3DestinationResponse[],
) {
  if (!destinationId) {
    return <span className="text-muted-foreground italic text-xs">Local</span>;
  }
  const match = destinations.find((d) => d.id === destinationId);
  if (!match) {
    return (
      <span className="text-muted-foreground italic text-xs">
        Unknown destination
      </span>
    );
  }
  return match.name;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

interface BackupSchedulesTableProps {
  destinations: S3DestinationResponse[];
  onDelete: (scheduleId: string) => void;
  onEdit: (schedule: BackupScheduleResponse) => void;
  onToggle: (schedule: BackupScheduleResponse) => void;
  schedules: BackupScheduleResponse[];
  togglePending: boolean;
}

function BackupSchedulesTable({
  destinations,
  onDelete,
  onEdit,
  onToggle,
  schedules,
  togglePending,
}: BackupSchedulesTableProps) {
  if (schedules.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No schedules. Create one to run backups automatically.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border hover:bg-transparent">
            <TableHead className="text-muted-foreground">Name</TableHead>
            <TableHead className="text-muted-foreground">Cron</TableHead>
            <TableHead className="text-muted-foreground">Timezone</TableHead>
            <TableHead className="text-muted-foreground">Destination</TableHead>
            <TableHead className="text-muted-foreground">Path</TableHead>
            <TableHead className="text-muted-foreground">Keep</TableHead>
            <TableHead className="text-muted-foreground">State</TableHead>
            <TableHead className="text-muted-foreground">Next run</TableHead>
            <TableHead className="text-right text-muted-foreground">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {schedules.map((schedule) => (
            <TableRow key={schedule.id}>
              <TableCell className="font-medium">{schedule.name}</TableCell>
              <TableCell className="font-mono text-xs">
                {schedule.cronExpression}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {schedule.timezone}
              </TableCell>
              <TableCell className="text-sm">
                {resolveDestinationName(schedule.s3DestinationId, destinations)}
              </TableCell>
              <TableCell className="max-w-[12rem] truncate font-mono text-muted-foreground text-xs">
                {schedule.pathPrefix ?? "—"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {schedule.retentionKeepLast
                  ? `Last ${String(schedule.retentionKeepLast)}`
                  : "All"}
              </TableCell>
              <TableCell>
                <Badge variant={schedule.enabled ? "default" : "secondary"}>
                  {schedule.enabled ? "Enabled" : "Paused"}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {schedule.nextRunAt ? formatTimestamp(schedule.nextRunAt) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    disabled={togglePending}
                    onClick={() => onToggle(schedule)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {schedule.enabled ? (
                      <>
                        <Pause className="size-3.5" /> Pause
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5" /> Resume
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => onEdit(schedule)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Edit
                  </Button>
                  <Button
                    onClick={() => {
                      if (
                        globalThis.confirm(
                          `Delete schedule "${schedule.name}"?`,
                        )
                      ) {
                        onDelete(schedule.id);
                      }
                    }}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ModalShellProps {
  children: React.ReactNode;
  description?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}

/** Small wrapper around the native <dialog> element to match other modals. */
function ModalShell({
  children,
  description,
  onOpenChange,
  open,
  title,
}: ModalShellProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const titleId = React.useId();

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) el.showModal();
    else if (el.open) el.close();
  }, [open]);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    function handleClose() {
      onOpenChange(false);
    }
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [onOpenChange]);

  return (
    <dialog
      aria-labelledby={titleId}
      className={cn(
        "fixed top-1/2 left-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-background p-0 shadow-lg outline-none",
        "[&::backdrop]:bg-black/50 [&::backdrop]:backdrop-blur-[2px]",
      )}
      ref={dialogRef}
    >
      <div className="flex max-h-[90vh] flex-col">
        <div className="border-border border-b px-5 py-4">
          <h2 className="font-semibold text-lg tracking-tight" id={titleId}>
            {title}
          </h2>
          {description ? (
            <p className="text-muted-foreground text-xs">{description}</p>
          ) : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}

interface RunBackupDialogProps {
  branchId: string;
  branchName: string;
  databaseId: string;
  destinations: S3DestinationResponse[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function RunBackupDialog({
  branchId,
  branchName,
  databaseId,
  destinations,
  onOpenChange,
  open,
}: RunBackupDialogProps) {
  const queryClient = useQueryClient();
  const titleId = React.useId();
  const [destinationId, setDestinationId] = React.useState<string>("");
  const [pathPrefix, setPathPrefix] = React.useState<string>("");
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFormError(null);
    setPathPrefix("");
    setDestinationId(destinations[0]?.id ?? "");
  }, [open, destinations]);

  const runMut = useMutation({
    mutationFn: async (input: CreateBackupRequest) =>
      createDatabaseBackupRequest(databaseId, input),
    onError: (error) => {
      setFormError(
        error instanceof Error ? error.message : "Could not start backup",
      );
    },
    onSuccess: async () => {
      setFormError(null);
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.databaseBackups(databaseId, branchId),
      });
      onOpenChange(false);
    },
  });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    const trimmedPath = pathPrefix.trim();
    runMut.mutate({
      branchId,
      pathPrefix: trimmedPath.length > 0 ? trimmedPath : undefined,
      s3DestinationId: destinationId || undefined,
    });
  }

  return (
    <ModalShell
      description={`Backup the ${branchName} branch.`}
      onOpenChange={onOpenChange}
      open={open}
      title="Run backup"
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <label
              className={labelClassName}
              htmlFor={`${titleId}-destination`}
            >
              Destination
            </label>
            <select
              className={selectClassName}
              disabled={runMut.isPending}
              id={`${titleId}-destination`}
              onChange={(event) => setDestinationId(event.currentTarget.value)}
              value={destinationId}
            >
              <option value="">No destination (local artifact)</option>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destinationOptionLabel(destination)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${titleId}-path`}>
              Path prefix · optional
            </label>
            <Input
              disabled={runMut.isPending}
              id={`${titleId}-path`}
              onChange={(event) => setPathPrefix(event.target.value)}
              placeholder="my-app/prod"
              value={pathPrefix}
            />
            <p className="text-muted-foreground text-xs">
              Folder/key prefix inside the destination bucket. Leave blank to
              use the default <code>openbika/{"{databaseId}"}/{"{branchId}"}</code>{" "}
              layout.
            </p>
          </div>

          {formError ? (
            <p className="text-destructive text-sm">{formError}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-border border-t px-5 py-4">
          <Button
            disabled={runMut.isPending}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={runMut.isPending} type="submit">
            {runMut.isPending ? "Starting…" : "Run backup"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

interface RestoreBackupDialogProps {
  branches: BranchResponse[];
  defaultTargetBranchId: string;
  error: string | null;
  job: BackupJobResponse | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: CreateRestoreRequest) => void;
  open: boolean;
  pending: boolean;
}

function RestoreBackupDialog({
  branches,
  defaultTargetBranchId,
  error,
  job,
  onOpenChange,
  onSubmit,
  open,
  pending,
}: RestoreBackupDialogProps) {
  const titleId = React.useId();
  const [mode, setMode] = React.useState<RestoreMode>("overwrite_existing");
  const [targetBranchId, setTargetBranchId] = React.useState<string>("");
  const [newBranchName, setNewBranchName] = React.useState<string>("");

  React.useEffect(() => {
    if (!open || !job) return;
    const sourceBranchId = job.branchId ?? defaultTargetBranchId;
    const fallback = branches[0]?.id ?? sourceBranchId;
    const initial = branches.some((b) => b.id === sourceBranchId)
      ? sourceBranchId
      : fallback;
    setMode("overwrite_existing");
    setTargetBranchId(initial);
    const timestamp = new Date().toISOString().slice(0, 10);
    setNewBranchName(`restore-${timestamp}`);
  }, [open, job, branches, defaultTargetBranchId]);

  const sourceBranch = job?.branchId
    ? (branches.find((b) => b.id === job.branchId) ?? null)
    : null;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (mode === "overwrite_existing") {
      if (!targetBranchId) return;
      onSubmit({ mode, targetBranchId });
    } else {
      const trimmed = newBranchName.trim();
      if (!trimmed) return;
      onSubmit({ mode, targetBranchName: trimmed });
    }
  }

  return (
    <ModalShell
      description={
        job
          ? sourceBranch
            ? `Restore the backup taken from branch ${sourceBranch.name}.`
            : `Restore backup ${job.id}.`
          : undefined
      }
      onOpenChange={onOpenChange}
      open={open}
      title="Restore backup"
    >
      {job ? (
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
          <div className="space-y-4 overflow-y-auto px-5 py-4">
            <fieldset className="space-y-2">
              <legend className={labelClassName}>Restore into</legend>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                <input
                  checked={mode === "overwrite_existing"}
                  className="mt-1"
                  name={`${titleId}-mode`}
                  onChange={() => setMode("overwrite_existing")}
                  type="radio"
                  value="overwrite_existing"
                />
                <span className="grid gap-1">
                  <span className="font-medium text-sm">An existing branch</span>
                  <span className="text-muted-foreground text-sm">
                    The selected branch's database will be wiped and replaced
                    with this backup. Sessions on that branch will be
                    disconnected.
                  </span>
                </span>
              </label>

              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
                <input
                  checked={mode === "new_branch"}
                  className="mt-1"
                  name={`${titleId}-mode`}
                  onChange={() => setMode("new_branch")}
                  type="radio"
                  value="new_branch"
                />
                <span className="grid gap-1">
                  <span className="font-medium text-sm">A new branch</span>
                  <span className="text-muted-foreground text-sm">
                    Create a fresh branch and restore the backup there. Other
                    branches stay untouched.
                  </span>
                </span>
              </label>
            </fieldset>

            {mode === "overwrite_existing" ? (
              <div className="space-y-2">
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-target-branch`}
                >
                  Target branch
                </label>
                <select
                  className={selectClassName}
                  id={`${titleId}-target-branch`}
                  onChange={(event) =>
                    setTargetBranchId(event.currentTarget.value)
                  }
                  required
                  value={targetBranchId}
                >
                  <option disabled value="">
                    Select a branch…
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {job.branchId === branch.id ? " · source" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-destructive/80 text-xs">
                  Warning: this drops and recreates the branch's database.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <label
                  className={labelClassName}
                  htmlFor={`${titleId}-new-branch`}
                >
                  New branch name
                </label>
                <Input
                  id={`${titleId}-new-branch`}
                  maxLength={63}
                  onChange={(event) => setNewBranchName(event.target.value)}
                  required
                  value={newBranchName}
                />
              </div>
            )}

            {error ? (
              <p className="text-destructive text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2 border-border border-t px-5 py-4">
            <Button
              disabled={pending}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={pending} type="submit">
              {pending ? "Restoring…" : "Restore"}
            </Button>
          </div>
        </form>
      ) : null}
    </ModalShell>
  );
}

interface BackupScheduleFormDialogProps {
  branchId: string;
  branchName: string;
  databaseId: string;
  destinations: S3DestinationResponse[];
  onOpenChange: (open: boolean) => void;
  open: boolean;
  schedule: BackupScheduleResponse | null;
}

interface ScheduleFormState {
  cronExpression: string;
  cronSelect: string;
  enabled: boolean;
  name: string;
  pathPrefix: string;
  retentionEnabled: boolean;
  retentionKeepLast: string;
  s3DestinationId: string;
  timezone: string;
}

function emptyScheduleForm(
  destinations: S3DestinationResponse[],
): ScheduleFormState {
  const defaultPreset = cronPresets[2] ?? cronPresets[0];
  return {
    cronExpression: defaultPreset?.expression ?? "0 3 * * *",
    cronSelect: defaultPreset?.expression ?? "0 3 * * *",
    enabled: true,
    name: "",
    pathPrefix: "",
    retentionEnabled: false,
    retentionKeepLast: "7",
    s3DestinationId: destinations[0]?.id ?? "",
    timezone: "UTC",
  };
}

function scheduleFormFromExisting(
  schedule: BackupScheduleResponse,
): ScheduleFormState {
  const cronOpt = cronOptionFor(schedule.cronExpression);
  return {
    cronExpression: schedule.cronExpression,
    cronSelect: cronOpt.selectValue,
    enabled: schedule.enabled,
    name: schedule.name,
    pathPrefix: schedule.pathPrefix ?? "",
    retentionEnabled: schedule.retentionKeepLast !== null,
    retentionKeepLast:
      schedule.retentionKeepLast !== null
        ? String(schedule.retentionKeepLast)
        : "7",
    s3DestinationId: schedule.s3DestinationId,
    timezone: schedule.timezone,
  };
}

function BackupScheduleFormDialog({
  branchId,
  branchName,
  databaseId,
  destinations,
  onOpenChange,
  open,
  schedule,
}: BackupScheduleFormDialogProps) {
  const queryClient = useQueryClient();
  const titleId = React.useId();
  const editing = schedule !== null;
  const [form, setForm] = React.useState<ScheduleFormState>(() =>
    emptyScheduleForm(destinations),
  );
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setFormError(null);
    setForm(
      schedule
        ? scheduleFormFromExisting(schedule)
        : emptyScheduleForm(destinations),
    );
  }, [open, schedule, destinations]);

  const createMut = useMutation({
    mutationFn: async (input: CreateBackupScheduleRequest) =>
      createBackupScheduleRequest(databaseId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.backupSchedules(databaseId, branchId),
      });
      onOpenChange(false);
    },
  });

  const patchMut = useMutation({
    mutationFn: async (input: {
      scheduleId: string;
      patch: PatchBackupScheduleRequest;
    }) => patchBackupScheduleRequest(input.scheduleId, input.patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: dashboardKeys.backupSchedules(databaseId, branchId),
      });
      onOpenChange(false);
    },
  });

  const saving = createMut.isPending || patchMut.isPending;

  function handleCronSelectChange(value: string) {
    setForm((prev) => {
      if (value === customCronValue) {
        return { ...prev, cronSelect: value };
      }
      return { ...prev, cronExpression: value, cronSelect: value };
    });
  }

  function handleCronExpressionChange(value: string) {
    setForm((prev) => ({
      ...prev,
      cronExpression: value,
      cronSelect: cronOptionFor(value).selectValue,
    }));
  }

  function buildRetentionValue(): number | null | undefined {
    if (!form.retentionEnabled) {
      return editing ? null : undefined;
    }
    const parsed = Number.parseInt(form.retentionKeepLast.trim(), 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      throw new Error("Retention must be a positive integer.");
    }
    return parsed;
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);

    if (!form.s3DestinationId) {
      setFormError("Pick a destination for this schedule.");
      return;
    }

    let retention: number | null | undefined;
    try {
      retention = buildRetentionValue();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Retention must be a positive integer.",
      );
      return;
    }

    const trimmedPath = form.pathPrefix.trim();

    try {
      if (schedule) {
        const patch: PatchBackupScheduleRequest = {
          cronExpression: form.cronExpression,
          enabled: form.enabled,
          name: form.name,
          pathPrefix: trimmedPath.length > 0 ? trimmedPath : null,
          retentionKeepLast: retention ?? null,
          s3DestinationId: form.s3DestinationId,
          timezone: form.timezone,
        };
        await patchMut.mutateAsync({ patch, scheduleId: schedule.id });
      } else {
        const payload: CreateBackupScheduleRequest = {
          branchId,
          cronExpression: form.cronExpression,
          enabled: form.enabled,
          name: form.name,
          s3DestinationId: form.s3DestinationId,
          timezone: form.timezone,
        };
        if (trimmedPath.length > 0) {
          payload.pathPrefix = trimmedPath;
        }
        if (retention !== undefined && retention !== null) {
          payload.retentionKeepLast = retention;
        }
        await createMut.mutateAsync(payload);
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Could not save schedule",
      );
    }
  }

  const customCron = form.cronSelect === customCronValue;
  const selectedPreset = cronPresets.find(
    (p) => p.expression === form.cronSelect,
  );

  return (
    <ModalShell
      description={`Schedules run against the ${branchName} branch.`}
      onOpenChange={onOpenChange}
      open={open}
      title={editing ? "Edit schedule" : "New schedule"}
    >
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={handleSubmit}>
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${titleId}-name`}>
              Name
            </label>
            <Input
              id={`${titleId}-name`}
              onChange={(event) => {
                const value = event.target.value;
                setForm((prev) => ({ ...prev, name: value }));
              }}
              required
              value={form.name}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label
                className={labelClassName}
                htmlFor={`${titleId}-cron-select`}
              >
                Cadence
              </label>
              <select
                className={selectClassName}
                id={`${titleId}-cron-select`}
                onChange={(event) =>
                  handleCronSelectChange(event.currentTarget.value)
                }
                value={form.cronSelect}
              >
                {cronPresets.map((preset) => (
                  <option key={preset.expression} value={preset.expression}>
                    {preset.label}
                  </option>
                ))}
                <option value={customCronValue}>Custom…</option>
              </select>
              <p className="text-muted-foreground text-xs">
                {customCron
                  ? "Provide your own cron expression below."
                  : (selectedPreset?.description ?? "")}
              </p>
            </div>
            <div className="space-y-2">
              <label
                className={labelClassName}
                htmlFor={`${titleId}-timezone`}
              >
                Timezone
              </label>
              <Input
                id={`${titleId}-timezone`}
                onChange={(event) => {
                  const value = event.target.value;
                  setForm((prev) => ({ ...prev, timezone: value }));
                }}
                placeholder="UTC"
                required
                value={form.timezone}
              />
              <p className="text-muted-foreground text-xs">
                IANA timezone (e.g. UTC, Europe/Paris).
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${titleId}-cron`}>
              Cron expression
            </label>
            <Input
              disabled={!customCron}
              id={`${titleId}-cron`}
              onChange={(event) =>
                handleCronExpressionChange(event.target.value)
              }
              required
              value={form.cronExpression}
            />
            <p className="text-muted-foreground text-xs">
              Five fields: minute, hour, day, month, day-of-week.
            </p>
          </div>

          <div className="space-y-2">
            <label
              className={labelClassName}
              htmlFor={`${titleId}-destination`}
            >
              Destination
            </label>
            <select
              className={selectClassName}
              id={`${titleId}-destination`}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setForm((prev) => ({ ...prev, s3DestinationId: value }));
              }}
              required
              value={form.s3DestinationId}
            >
              <option value="">Select a destination…</option>
              {destinations.map((destination) => (
                <option key={destination.id} value={destination.id}>
                  {destinationOptionLabel(destination)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className={labelClassName} htmlFor={`${titleId}-path`}>
              Path prefix · optional
            </label>
            <Input
              id={`${titleId}-path`}
              onChange={(event) => {
                const value = event.target.value;
                setForm((prev) => ({ ...prev, pathPrefix: value }));
              }}
              placeholder="my-app/prod"
              value={form.pathPrefix}
            />
            <p className="text-muted-foreground text-xs">
              Folder/key prefix inside the destination bucket.
            </p>
          </div>

          <div className="rounded-lg border border-border p-3">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                checked={form.retentionEnabled}
                className="mt-1"
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setForm((prev) => ({ ...prev, retentionEnabled: checked }));
                }}
                type="checkbox"
              />
              <span className="grid gap-1">
                <span className="font-medium text-sm">
                  Keep the latest N backups
                </span>
                <span className="text-muted-foreground text-sm">
                  When set, succeeded jobs older than this many runs are
                  pruned after each new backup.
                </span>
              </span>
            </label>
            {form.retentionEnabled ? (
              <div className="mt-3 flex items-center gap-2">
                <Input
                  className="max-w-[8rem]"
                  inputMode="numeric"
                  min={1}
                  onChange={(event) => {
                    const value = event.target.value;
                    setForm((prev) => ({ ...prev, retentionKeepLast: value }));
                  }}
                  pattern="[0-9]*"
                  required
                  type="number"
                  value={form.retentionKeepLast}
                />
                <span className="text-muted-foreground text-sm">
                  most recent backup(s)
                </span>
              </div>
            ) : null}
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <input
              checked={form.enabled}
              className="mt-1"
              onChange={(event) => {
                const checked = event.currentTarget.checked;
                setForm((prev) => ({ ...prev, enabled: checked }));
              }}
              type="checkbox"
            />
            <span className="grid gap-1">
              <span className="font-medium text-sm">Enabled</span>
              <span className="text-muted-foreground text-sm">
                When off, no new jobs will be dispatched.
              </span>
            </span>
          </label>

          {formError ? (
            <p className="text-destructive text-sm">{formError}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-border border-t px-5 py-4">
          <Button
            disabled={saving}
            onClick={() => onOpenChange(false)}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button disabled={saving} type="submit">
            {saving ? "Saving…" : editing ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

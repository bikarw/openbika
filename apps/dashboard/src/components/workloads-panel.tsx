import { Link, useNavigate } from "@tanstack/react-router";
import {
  type CreateWorkloadRequest,
  readObservedWorkloadIngressRoutes,
  type WorkloadResponse,
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
import { cn } from "@openbika/ui/lib/utils";
import {
  AlertCircle,
  Boxes,
  Container,
  Plus,
  Workflow,
  X,
} from "lucide-react";
import * as React from "react";

type WorkloadStatusTone = "neutral" | "ok" | "warn" | "fail";
type WorkloadKind = WorkloadResponse["kind"];

type CreateWorkloadHandler = (
  input: CreateWorkloadRequest,
) => Promise<WorkloadResponse>;

interface WorkloadsPanelProps {
  errorMessage: string | null;
  navigation?: {
    organizationSlug: string;
    projectSlug: string;
  };
  onCreateWorkload: CreateWorkloadHandler;
  workloads: WorkloadResponse[];
}

export function workloadKindLabel(kind: WorkloadKind): string {
  switch (kind) {
    case "unconfigured":
      return "Unconfigured";
    case "container":
      return "Container";
    case "function":
      return "Function";
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

export function workloadKindIcon(kind: WorkloadKind) {
  return kind === "container" ? Container : Workflow;
}

export function workloadStatusTone(
  status: WorkloadResponse["status"],
): WorkloadStatusTone {
  switch (status) {
    case "available":
      return "ok";
    case "draft":
    case "requested":
    case "provisioning":
    case "maintenance":
      return "neutral";
    case "degraded":
      return "warn";
    case "failed":
    case "deleted":
      return "fail";
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

export function workloadObservedError(
  workload: WorkloadResponse,
): string | null {
  const raw = workload.observedState.error;
  return typeof raw === "string" ? raw : null;
}

/** Public ingress URL persisted by the provisioner (`observedState.ingressRoutes` or legacy `publicBaseUrl`). */
export function workloadObservedPublicBaseUrl(
  workload: WorkloadResponse,
): string | null {
  const observed =
    workload.observedState !== null &&
    typeof workload.observedState === "object" &&
    !Array.isArray(workload.observedState)
      ? (workload.observedState as Record<string, unknown>)
      : {};

  const routes = readObservedWorkloadIngressRoutes(observed);
  const primary = routes[0]?.url?.trim();
  if (primary) {
    return primary;
  }

  const raw = observed.publicBaseUrl;
  return typeof raw === "string" && raw.trim().length > 0
    ? raw.trim()
    : null;
}

export function WorkloadsPanel({
  errorMessage,
  navigation,
  onCreateWorkload,
  workloads,
}: WorkloadsPanelProps) {
  return (
    <div className="grid gap-4">
      {workloads.length > 0 ? (
        <div className="flex justify-end">
          <CreateWorkloadModal
            existingNames={workloads.map((w) => w.name)}
            navigation={navigation}
            onCreateWorkload={onCreateWorkload}
          />
        </div>
      ) : null}

      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {workloads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/40">
              <Boxes className="text-muted-foreground size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm">No workloads yet</p>
              <p className="text-muted-foreground text-sm">
                Add a container (e.g. Redis) or a function (Bun / Node) to this
                project.
              </p>
            </div>
            <CreateWorkloadModal
              existingNames={workloads.map((w) => w.name)}
              navigation={navigation}
              onCreateWorkload={onCreateWorkload}
              triggerLabel="Add your first workload"
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {workloads.map((workload) => (
            <WorkloadCard
              key={workload.id}
              navigation={navigation}
              workload={workload}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WorkloadCard({
  navigation,
  workload,
}: {
  navigation?: {
    organizationSlug: string;
    projectSlug: string;
  };
  workload: WorkloadResponse;
}) {
  const Icon = workloadKindIcon(workload.kind);
  const error = workloadObservedError(workload);

  const card = (
    <Card className="h-full transition-colors hover:bg-muted/30">
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
              <Icon className="text-muted-foreground size-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {workload.name}
              </CardTitle>
              <CardDescription>
                {workloadKindLabel(workload.kind)}
              </CardDescription>
            </div>
          </div>
          <StatusDot status={workload.status} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {workload.kind === "container" ? (
          <KeyValueRow
            label="Image"
            value={
              typeof workload.desiredState.image === "string"
                ? workload.desiredState.image
                : "—"
            }
          />
        ) : workload.kind === "function" ? (
          <KeyValueRow
            label="Runtime"
            value={
              typeof workload.desiredState.runtime === "string"
                ? workload.desiredState.runtime
                : "—"
            }
          />
        ) : (
          <KeyValueRow label="Status" value="Ready to configure" />
        )}
        {error ? (
          <p className="text-destructive flex items-start gap-1.5 text-xs leading-snug">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );

  if (navigation) {
    return (
      <Link
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        params={{
          organizationSlug: navigation.organizationSlug,
          projectSlug: navigation.projectSlug,
          workloadId: workload.id,
        }}
        preload="intent"
        to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId"
      >
        {card}
      </Link>
    );
  }

  return card;
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="shrink-0 text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span className="min-w-0 truncate text-right font-mono text-foreground">
        {value}
      </span>
    </div>
  );
}

export function StatusDot({
  status,
}: {
  status: WorkloadResponse["status"];
}) {
  const tone = workloadStatusTone(status);
  const dotClass = (() => {
    switch (tone) {
      case "ok":
        return "bg-emerald-500";
      case "neutral":
        return "bg-amber-500 animate-pulse";
      case "warn":
        return "bg-amber-500";
      case "fail":
        return "bg-destructive";
      default: {
        const exhaustive: never = tone;
        return exhaustive;
      }
    }
  })();

  return (
    <Badge className="gap-1.5" variant="outline">
      <span className={cn("size-1.5 rounded-full", dotClass)} />
      <span className="text-xs">{status}</span>
    </Badge>
  );
}

interface CreateWorkloadModalProps {
  existingNames: string[];
  navigation?: {
    organizationSlug: string;
    projectSlug: string;
  };
  onCreateWorkload: CreateWorkloadHandler;
  triggerLabel?: string;
}

function CreateWorkloadModal({
  existingNames,
  navigation,
  onCreateWorkload,
  triggerLabel = "New workload",
}: CreateWorkloadModalProps) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  function reset() {
    setName("");
    setErrorMessage(null);
  }

  function close() {
    if (submitting) return;
    setOpen(false);
    reset();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Workload name is required.");
      return;
    }

    if (existingNames.includes(trimmedName)) {
      setErrorMessage("A workload with this name already exists.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const created = await onCreateWorkload({ name: trimmedName });
      setOpen(false);
      reset();
      if (navigation) {
        await navigate({
          params: {
            organizationSlug: navigation.organizationSlug,
            projectSlug: navigation.projectSlug,
            workloadId: created.id,
          },
          to: "/$organizationSlug/projects/$projectSlug/workloads/$workloadId",
        });
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create workload",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} type="button">
        <Plus className="size-4" />
        {triggerLabel}
      </Button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 text-left backdrop-blur-sm"
          role="dialog"
        >
          <form
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-xl flex-col rounded-xl border border-border bg-card text-card-foreground shadow-lg"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="flex items-start justify-between gap-4 border-border border-b p-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  Create workload
                </h2>
                <p className="text-muted-foreground text-sm">
                  Name it now, then configure source, runtime, and deploy from
                  its overview page.
                </p>
              </div>
              <Button
                aria-label="Close create workload modal"
                disabled={submitting}
                onClick={close}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="workload-name">
                  Workload name
                </label>
                <Input
                  autoFocus
                  id="workload-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="api"
                  value={name}
                />
              </div>

              {errorMessage ? (
                <p className="text-destructive text-sm" role="alert">
                  {errorMessage}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 border-border border-t p-4">
              <Button
                disabled={submitting}
                onClick={close}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={submitting} type="submit">
                {submitting ? "Creating…" : "Create workload"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}


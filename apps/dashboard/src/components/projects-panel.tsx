import type {
  OrganizationResponse,
  ProjectSummaryResponse,
} from "@openbika/contracts";
import { Link } from "@tanstack/react-router";
import { Button } from "@openbika/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { Input } from "@openbika/ui/components/input";
import { cn } from "@openbika/ui/lib/utils";
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  Database,
  GitBranch,
  Hash,
  Plus,
  Workflow,
  X,
} from "lucide-react";
import * as React from "react";

import { ProjectsPanelGridSkeleton } from "#/components/loading-placeholders";

export interface ProjectsPanelProps {
  errorMessage: string | null;
  loading: boolean;
  onCreateProject: (input: { name: string }) => Promise<void>;
  organizations: OrganizationResponse[];
  selectedOrganizationId: string | null;
  summaries: ProjectSummaryResponse[];
}

export function ProjectsPanel({
  errorMessage,
  loading,
  onCreateProject,
  organizations,
  selectedOrganizationId,
  summaries,
}: ProjectsPanelProps) {
  const org = organizations.find((o) => o.id === selectedOrganizationId);
  const rows = summaries.filter(
    (p) =>
      selectedOrganizationId !== null &&
      p.organizationId === selectedOrganizationId,
  );

  const title = org ? `${org.name}'s projects` : "Your projects";

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 px-4 py-4 md:px-5 md:py-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">
            Databases, containers and functions for this organization.
          </p>
        </div>
        <CreateProjectModal
          disabled={loading || !selectedOrganizationId}
          onCreateProject={onCreateProject}
        />
      </div>

      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        {loading ? (
          <ProjectsPanelGridSkeleton />
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/40">
                <Boxes className="text-muted-foreground size-6" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-sm">No projects yet</p>
                <p className="text-muted-foreground text-sm">
                  Create one to get started.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((project) => (
              <ProjectCard
                key={project.id}
                organizationSlug={org?.slug ?? null}
                project={project}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  organizationSlug,
  project,
}: {
  organizationSlug: string | null;
  project: ProjectSummaryResponse;
}) {
  const serviceCount = project.databaseCount + project.workloadCount;
  const card = (
    <Card className="h-full transition-colors group-hover:border-foreground/30">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
            <Boxes className="text-muted-foreground size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="truncate text-base">{project.name}</CardTitle>
              <ProjectStatusDot
                hasFailure={project.hasFailure}
                isProvisioning={project.isProvisioning}
              />
            </div>
            <p className="text-muted-foreground inline-flex items-center gap-1.5 truncate text-xs">
              <Hash className="size-3" />
              <span className="truncate font-mono">{project.slug}</span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="min-w-0 flex-nowrap items-center justify-start gap-2 overflow-hidden">
        <Chip
          className="min-w-0 flex-1"
          icon={<Boxes className="size-3.5" />}
          label={`${serviceCount} ${serviceCount === 1 ? "service" : "services"}`}
        />
        <Chip
          className="shrink-0"
          icon={<Database className="size-3.5" />}
          label={project.databaseCount.toString()}
          tooltip="Databases"
        />
        <Chip
          className="shrink-0"
          icon={<Workflow className="size-3.5" />}
          label={project.workloadCount.toString()}
          tooltip="Workloads"
        />
        <Chip
          className="shrink-0"
          icon={<GitBranch className="size-3.5" />}
          label={project.branchCount.toString()}
          tooltip="Branches"
        />
        <span className="text-muted-foreground group-hover:text-foreground ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors">
          Open
          <ArrowUpRight className="size-3.5" />
        </span>
      </CardFooter>
    </Card>
  );

  if (!organizationSlug) {
    return <div className="group block h-full">{card}</div>;
  }

  return (
    <Link
      aria-label={`Open ${project.name}`}
      className="group block h-full"
      params={{ organizationSlug, projectSlug: project.slug }}
      preload="intent"
      to="/$organizationSlug/projects/$projectSlug"
    >
      {card}
    </Link>
  );
}

function Chip({
  className,
  icon,
  label,
  tooltip,
}: {
  className?: string;
  icon: React.ReactNode;
  label: string;
  tooltip?: string;
}) {
  return (
    <span
      className={cn(
        "text-muted-foreground inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-xs",
        className,
      )}
      title={tooltip}
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ProjectStatusDot({
  hasFailure,
  isProvisioning,
}: {
  hasFailure: boolean;
  isProvisioning: boolean;
}) {
  if (hasFailure) {
    return (
      <span
        aria-label="One or more services failed"
        className="text-destructive inline-flex items-center gap-1 text-xs"
        title="One or more services failed"
      >
        <AlertCircle className="size-3.5" />
      </span>
    );
  }

  if (isProvisioning) {
    return (
      <span
        aria-label="Provisioning"
        className={cn(
          "inline-block size-2 shrink-0 rounded-full bg-amber-500",
          "animate-pulse",
        )}
        title="Provisioning"
      />
    );
  }

  return (
    <span
      aria-label="Healthy"
      className="inline-block size-2 shrink-0 rounded-full bg-emerald-500"
      title="Healthy"
    />
  );
}

function CreateProjectModal({
  disabled,
  onCreateProject,
}: {
  disabled: boolean;
  onCreateProject: (input: { name: string }) => Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setName("");
    setErrorMessage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Project name is required.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await onCreateProject({ name: trimmedName });
      setOpen(false);
      setName("");
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create project",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        className="w-full sm:w-auto"
        disabled={disabled}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Plus className="size-4" />
        New project
      </Button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 text-left backdrop-blur-sm"
          role="dialog"
        >
          <form
            className="w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground shadow-lg"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="flex items-start justify-between gap-4 border-border border-b p-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  Create project
                </h2>
                <p className="text-muted-foreground text-sm">
                  Name the project and create its first database.
                </p>
              </div>
              <Button
                aria-label="Close create project modal"
                disabled={submitting}
                onClick={closeModal}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-5 p-4">
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="project-name">
                  Project name
                </label>
                <Input
                  autoFocus
                  id="project-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Customer analytics"
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
                onClick={closeModal}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={submitting} type="submit">
                {submitting ? "Creating…" : "Create project"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

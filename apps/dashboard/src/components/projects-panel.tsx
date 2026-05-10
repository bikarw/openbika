import type {
  OrganizationResponse,
  ProjectResponse,
} from "@openbika/contracts";
import { Button } from "@openbika/ui/components/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { Input } from "@openbika/ui/components/input";
import {
  ArrowUpRight,
  Database,
  GitBranch,
  Hash,
  Plus,
  X,
} from "lucide-react";
import * as React from "react";

export interface ProjectsPanelProps {
  branchCountsByProjectId: Record<string, number>;
  errorMessage: string | null;
  loading: boolean;
  onCreateProject: (input: { name: string }) => Promise<void>;
  organizations: OrganizationResponse[];
  projects: ProjectResponse[];
  selectedOrganizationId: string | null;
}

export function ProjectsPanel({
  branchCountsByProjectId,
  errorMessage,
  loading,
  onCreateProject,
  organizations,
  projects,
  selectedOrganizationId,
}: ProjectsPanelProps) {
  const org = organizations.find((o) => o.id === selectedOrganizationId);
  const rows = projects.filter(
    (p) =>
      selectedOrganizationId !== null &&
      p.organizationId === selectedOrganizationId,
  );

  const title = org ? `${org.name}'s projects` : "Your projects";

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-sm">
            Manage Postgres projects for this organization.
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
          <Card>
            <CardContent className="text-muted-foreground py-6 text-sm">
              Loading projects…
            </CardContent>
          </Card>
        ) : rows.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-sm">
              No projects yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((project) => {
              const branchCount = branchCountsByProjectId[project.id] ?? 0;
              const branchLabel =
                branchCount === 1 ? "1 branch" : `${branchCount} branches`;
              const projectHref = org
                ? `/${org.slug}/projects/${project.slug}`
                : "#";

              return (
                <a
                  aria-label={`Open ${project.name}`}
                  className="group block h-full"
                  href={projectHref}
                  key={project.id}
                >
                  <Card className="h-full transition-colors group-hover:bg-accent/40">
                    <CardHeader>
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted">
                          <Database className="text-muted-foreground size-5" />
                        </div>
                        <div className="min-w-0">
                          <CardTitle className="truncate text-base">
                            {project.name}
                          </CardTitle>
                        </div>
                      </div>
                    </CardHeader>
                    <CardFooter className="flex-wrap justify-start gap-2">
                      <span className="text-muted-foreground group-hover:text-foreground inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors">
                        <Hash className="size-3.5 shrink-0" />
                        <span className="truncate font-mono">
                          {project.slug}
                        </span>
                      </span>
                      <span className="text-muted-foreground group-hover:text-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors">
                        <GitBranch className="size-3.5" />
                        {branchLabel}
                      </span>
                      <span className="text-muted-foreground group-hover:text-foreground ml-auto inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors">
                        Open
                        <ArrowUpRight className="size-3.5" />
                      </span>
                    </CardFooter>
                  </Card>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
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

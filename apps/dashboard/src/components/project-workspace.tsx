import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import type {
  BranchCopyMode,
  BranchConnectionResponse,
  BranchExpirationTtl,
  BranchResponse,
  CreateWorkloadRequest,
  DatabaseResponse,
  OrganizationResponse,
  ProjectResponse,
  WorkloadResponse,
} from "@openbika/contracts";
import { Badge } from "@openbika/ui/components/badge";
import { Button, buttonVariants } from "@openbika/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@openbika/ui/components/dropdown-menu";
import { Input } from "@openbika/ui/components/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
} from "@openbika/ui/components/sidebar";
import { cn } from "@openbika/ui/lib/utils";
import {
  AlertCircle,
  Boxes,
  Check,
  ChevronsUpDown,
  Clock,
  Code2,
  Copy,
  Database,
  Eye,
  EyeOff,
  GitBranch,
  Hash,
  LayoutDashboard,
  LogOut,
  Plus,
  RotateCcw,
  Table2,
  Workflow,
  X,
} from "lucide-react";
import * as React from "react";

import { authClient } from "#/auth-client";
import { OrgSwitcher } from "#/components/org-switcher";
import { SqlEditor } from "#/components/sql-editor";
import { TablesStudio } from "#/components/tables-studio";
import {
  StatusDot,
  WorkloadsPanel,
  workloadKindIcon,
  workloadKindLabel,
  workloadObservedError,
} from "#/components/workloads-panel";
import { getDashboardApiClient } from "#/lib/openbika-client";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";

type ProjectWorkspaceView =
  | "branches"
  | "dashboard"
  | "database-detail"
  | "databases"
  | "services"
  | "workloads"
  | "workload-detail";

interface ProjectWorkspaceProps {
  children?: React.ReactNode;
  databaseDetailId?: string;
  focusedDatabaseId?: string;
  organizationSlug: string;
  projectSlug: string;
  view: ProjectWorkspaceView;
  workloadDetailId?: string;
}

interface WorkspaceBranch {
  branch: BranchResponse;
  database: DatabaseResponse;
}

export interface ProjectWorkspaceOutletContext {
  branches: WorkspaceBranch[];
  databases: DatabaseResponse[];
  onCreateBranch: (input: {
    copyMode: BranchCopyMode;
    databaseId: string;
    expirationTtl?: BranchExpirationTtl;
    name: string;
    parentBranchId?: string;
  }) => Promise<void>;
  organizationSlug: string;
  projectSlug: string;
  refreshWorkloads: () => Promise<void>;
  workloads: WorkloadResponse[];
}

const ProjectOutletContext = React.createContext<
  ProjectWorkspaceOutletContext | null
>(null);

export function useProjectWorkspaceOutlet(): ProjectWorkspaceOutletContext {
  const value = React.useContext(ProjectOutletContext);
  if (!value) {
    throw new Error("useProjectWorkspaceOutlet must be used under ProjectWorkspace.");
  }
  return value;
}

function pickOrganization(
  organizations: OrganizationResponse[],
): OrganizationResponse | null {
  if (organizations.length === 0) return null;
  const stored = readStoredOrganizationId();
  const storedOrganization = organizations.find((o) => o.id === stored);
  if (storedOrganization) {
    return storedOrganization;
  }
  return organizations[0] ?? null;
}

function flattenBranches(databases: DatabaseResponse[]) {
  return databases.flatMap((database) =>
    database.branches.map((branch) => ({ branch, database })),
  );
}

function countBranches(databases: DatabaseResponse[]) {
  return databases.reduce(
    (total, database) => total + database.branches.length,
    0,
  );
}

function hasActiveDatabaseProvisioning(databases: DatabaseResponse[]) {
  return databases.some(
    (database) =>
      database.status === "requested" ||
      database.status === "provisioning" ||
      database.branches.some(
        (branch) =>
          branch.status === "requested" || branch.status === "creating",
      ),
  );
}

function hasActiveWorkloadProvisioning(workloads: WorkloadResponse[]) {
  return workloads.some(
    (workload) =>
      workload.status === "requested" ||
      workload.status === "provisioning",
  );
}

function hasActiveProvisioning(
  databases: DatabaseResponse[],
  workloads: WorkloadResponse[],
) {
  return (
    hasActiveDatabaseProvisioning(databases) ||
    hasActiveWorkloadProvisioning(workloads)
  );
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return count === 1 ? `1 ${singular}` : `${count} ${plural}`;
}

function branchCopyModeLabel(copyMode: BranchCopyMode) {
  switch (copyMode) {
    case "schema_only":
      return "Schema only";
    case "schema_and_data":
      return "Schema + current data";
    default: {
      const exhaustive: never = copyMode;
      return exhaustive;
    }
  }
}

function expirationTtlLabel(expirationTtl: BranchExpirationTtl | "") {
  switch (expirationTtl) {
    case "":
      return "No expiration";
    case "1h":
      return "Delete after 1 hour";
    case "1d":
      return "Delete after 1 day";
    case "7d":
      return "Delete after 7 days";
    default: {
      const exhaustive: never = expirationTtl;
      return exhaustive;
    }
  }
}

function branchExpirationLabel(expiresAt: string | null) {
  if (!expiresAt) return "No expiration";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(expiresAt));
}

function viewLabel(view: ProjectWorkspaceView) {
  switch (view) {
    case "branches":
      return "Branches";
    case "dashboard":
      return "Overview";
    case "database-detail":
      return "Database";
    case "databases":
      return "Databases";
    case "services":
      return "Services";
    case "workloads":
      return "Workloads";
    case "workload-detail":
      return "Workload";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

export function ProjectWorkspace({
  children,
  databaseDetailId,
  focusedDatabaseId,
  organizationSlug,
  projectSlug,
  view,
  workloadDetailId,
}: ProjectWorkspaceProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = React.useState<
    OrganizationResponse[]
  >([]);
  const [projects, setProjects] = React.useState<ProjectResponse[]>([]);
  const [project, setProject] = React.useState<ProjectResponse | null>(null);
  const [databases, setDatabases] = React.useState<DatabaseResponse[]>([]);
  const [workloads, setWorkloads] = React.useState<WorkloadResponse[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(true);
  const [healthStatus, setHealthStatus] = React.useState<
    "error" | "loading" | "ok" | null
  >(null);

  const selectedOrganizationId =
    organizations.find((o) => o.slug === organizationSlug)?.id ?? null;
  const branches = flattenBranches(databases);

  const selectedBranch = databaseDetailId
    ? (branches.filter((item) => item.database.id === databaseDetailId)[0] ??
      null)
    : focusedDatabaseId
      ? (branches.filter((item) => item.database.id === focusedDatabaseId)[0] ??
        null)
      : null;
  const shouldPollProvisioning = project
    ? hasActiveProvisioning(databases, workloads)
    : false;

  React.useEffect(() => {
    let cancelled = false;
    const client = getDashboardApiClient();

    async function load() {
      setPending(true);
      setLoadError(null);
      setProject(null);
      setDatabases([]);
      setWorkloads([]);
      setHealthStatus("loading");

      try {
        const healthPromise = client.health().then(
          () => true as const,
          () => false as const,
        );
        const orgs = await client.listOrganizations();
        if (cancelled) return;

        const active = orgs.find((org) => org.slug === organizationSlug);
        if (!active) {
          const fallback = pickOrganization(orgs);
          setOrganizations(orgs);

          if (!fallback) {
            setLoadError("No organizations available.");
            setHealthStatus("error");
            return;
          }

          await navigate({
            to: "/$organizationSlug/projects",
            params: { organizationSlug: fallback.slug },
            replace: true,
          });
          return;
        }

        writeStoredOrganizationId(active.id);

        const [projectList, healthy] = await Promise.all([
          client.listProjects({ organizationId: active.id }),
          healthPromise,
        ]);
        if (cancelled) return;

        const activeProject =
          projectList.find((item) => item.slug === projectSlug) ?? null;

        setOrganizations(orgs);
        setProjects(projectList);
        setHealthStatus(healthy ? "ok" : "error");

        if (!activeProject) {
          setLoadError("Project not found.");
          return;
        }

        const [databaseList, workloadList] = await Promise.all([
          client.listDatabases(activeProject.id),
          client.listWorkloads(activeProject.id),
        ]);
        if (cancelled) return;

        setProject(activeProject);
        setDatabases(databaseList);
        setWorkloads(workloadList);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load project",
        );
        setProject(null);
        setDatabases([]);
        setWorkloads([]);
        setHealthStatus("error");
      } finally {
        if (!cancelled) setPending(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [navigate, organizationSlug, projectSlug]);

  React.useEffect(() => {
    if (!project || !shouldPollProvisioning) return;

    const projectId = project.id;
    let cancelled = false;
    const client = getDashboardApiClient();

    async function refreshProvisioningStatus() {
      try {
        const [databaseList, workloadList] = await Promise.all([
          client.listDatabases(projectId),
          client.listWorkloads(projectId),
        ]);
        if (!cancelled) {
          setDatabases(databaseList);
          setWorkloads(workloadList);
          setHealthStatus("ok");
        }
      } catch {
        if (!cancelled) {
          setHealthStatus("error");
        }
      }
    }

    void refreshProvisioningStatus();
    const intervalId = window.setInterval(
      () => void refreshProvisioningStatus(),
      2_500,
    );

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [project, shouldPollProvisioning]);

  function handleSelectOrganization(organizationId: string) {
    const organization = organizations.find((org) => org.id === organizationId);
    if (!organization) return;

    writeStoredOrganizationId(organization.id);
    void navigate({
      to: "/$organizationSlug/projects",
      params: { organizationSlug: organization.slug },
    });
  }

  function handleSelectProject(nextProjectSlug: string) {
    void navigate({
      to: "/$organizationSlug/projects/$projectSlug",
      params: { organizationSlug, projectSlug: nextProjectSlug },
    });
  }

  async function handleCreateWorkload(input: CreateWorkloadRequest) {
    if (!project) {
      throw new Error("Project is not loaded yet.");
    }

    const client = getDashboardApiClient();
    const workload = await client.createWorkload(project.id, input);

    setWorkloads((current) => [...current, workload]);
  }

  const refreshWorkloads = React.useCallback(async (): Promise<void> => {
    if (!project) {
      return;
    }

    const client = getDashboardApiClient();
    try {
      const list = await client.listWorkloads(project.id);
      setWorkloads(list);
      setHealthStatus("ok");
    } catch {
      setHealthStatus("error");
    }
  }, [project]);

  const workloadHydrationAttemptRef = React.useRef<string | null>(null);
  const [workloadDetailHydrationPending, setWorkloadDetailHydrationPending] =
    React.useState(false);
  const [workloadDetailHydrationError, setWorkloadDetailHydrationError] =
    React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      view !== "workload-detail" ||
      workloadDetailId === undefined ||
      !project
    ) {
      workloadHydrationAttemptRef.current = null;
      setWorkloadDetailHydrationPending(false);
      setWorkloadDetailHydrationError(null);
      return;
    }

    if (pending) {
      return;
    }

    const listed = workloads.some((w) => w.id === workloadDetailId);
    if (listed) {
      workloadHydrationAttemptRef.current = null;
      setWorkloadDetailHydrationPending(false);
      setWorkloadDetailHydrationError(null);
      return;
    }

    const attemptKey = `${project.id}:${workloadDetailId}`;
    if (workloadHydrationAttemptRef.current === attemptKey) {
      return;
    }

    workloadHydrationAttemptRef.current = attemptKey;
    setWorkloadDetailHydrationPending(true);
    setWorkloadDetailHydrationError(null);

    let cancelled = false;
    const client = getDashboardApiClient();

    void (async () => {
      try {
        const fetched = await client.getWorkload(workloadDetailId);
        if (cancelled) return;

        if (fetched.projectId !== project.id) {
          setWorkloadDetailHydrationError(
            "This workload belongs to another project. Open it from that project's workloads list.",
          );
          setWorkloadDetailHydrationPending(false);
          return;
        }

        setWorkloads((curr) =>
          curr.some((w) => w.id === fetched.id) ? curr : [...curr, fetched],
        );
        setWorkloadDetailHydrationPending(false);
        workloadHydrationAttemptRef.current = null;
      } catch (err) {
        if (cancelled) return;
        setWorkloadDetailHydrationPending(false);
        setWorkloadDetailHydrationError(
          err instanceof Error ? err.message : "Unable to load this workload.",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [view, workloadDetailId, project, pending, workloads]);

  async function handleCreateBranch(input: {
    copyMode: BranchCopyMode;
    databaseId: string;
    expirationTtl?: BranchExpirationTtl;
    name: string;
    parentBranchId?: string;
  }) {
    const client = getDashboardApiClient();
    const branch = await client.createBranch(input.databaseId, {
      copyMode: input.copyMode,
      expirationTtl: input.expirationTtl,
      name: input.name,
      parentBranchId: input.parentBranchId,
    });

    setDatabases((currentDatabases) =>
      currentDatabases.map((database) =>
        database.id === input.databaseId
          ? { ...database, branches: [...database.branches, branch] }
          : database,
      ),
    );

    await navigate({
      params: {
        branchId: branch.id,
        databaseId: input.databaseId,
        organizationSlug,
        projectSlug,
        view: "overview",
      },
      search: {},
      to: "/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view",
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  return (
    <ProjectWorkspaceShell
      branches={branches}
      databaseDetailId={databaseDetailId}
      databases={databases}
      healthStatus={healthStatus}
      onRefreshWorkloads={refreshWorkloads}
      onCreateBranch={handleCreateBranch}
      onSelectOrganization={handleSelectOrganization}
      onSelectProject={handleSelectProject}
      onSignOut={handleSignOut}
      organizations={organizations}
      organizationSlug={organizationSlug}
      pending={pending}
      project={project}
      projects={projects}
      projectSlug={projectSlug}
      selectedOrganizationId={selectedOrganizationId}
      view={view}
      workloadDetailHydrationError={workloadDetailHydrationError}
      workloadDetailHydrationPending={workloadDetailHydrationPending}
      workloadDetailId={workloadDetailId}
      workloads={workloads}
    >
      {children ?? (
        <ProjectWorkspaceContent
          branches={branches}
          databases={databases}
          errorMessage={loadError}
          loading={pending}
          onCreateBranch={handleCreateBranch}
          onCreateWorkload={handleCreateWorkload}
          organizationSlug={organizationSlug}
          project={project}
          projectSlug={projectSlug}
          selectedBranch={selectedBranch}
          view={view}
          workloads={workloads}
          focusedDatabaseId={focusedDatabaseId}
        />
      )}
    </ProjectWorkspaceShell>
  );
}

interface ProjectWorkspaceShellProps {
  branches: WorkspaceBranch[];
  children: React.ReactNode;
  databaseDetailId?: string;
  databases: DatabaseResponse[];
  healthStatus: "error" | "loading" | "ok" | null;
  onRefreshWorkloads: () => Promise<void>;
  onCreateBranch: (input: {
    copyMode: BranchCopyMode;
    databaseId: string;
    expirationTtl?: BranchExpirationTtl;
    name: string;
    parentBranchId?: string;
  }) => Promise<void>;
  onSelectOrganization: (organizationId: string) => void;
  onSelectProject: (projectSlug: string) => void;
  onSignOut: () => void;
  organizations: OrganizationResponse[];
  organizationSlug: string;
  pending: boolean;
  project: ProjectResponse | null;
  projects: ProjectResponse[];
  projectSlug: string;
  selectedOrganizationId: string | null;
  view: ProjectWorkspaceView;
  workloadDetailHydrationError: string | null;
  workloadDetailHydrationPending: boolean;
  workloadDetailId?: string;
  workloads: WorkloadResponse[];
}

function ProjectWorkspaceShell({
  branches,
  children,
  databaseDetailId,
  databases,
  healthStatus,
  onRefreshWorkloads,
  onCreateBranch,
  onSelectOrganization,
  onSelectProject,
  onSignOut,
  organizations,
  organizationSlug,
  pending,
  project,
  projects,
  projectSlug,
  selectedOrganizationId,
  view,
  workloadDetailHydrationError,
  workloadDetailHydrationPending,
  workloadDetailId,
  workloads,
}: ProjectWorkspaceShellProps) {
  const pathname = useRouterState({
    select: (s) => stripTrailingSlash(s.location.pathname),
  });
  const databasesBasePath = stripTrailingSlash(
    `/${organizationSlug}/projects/${projectSlug}/databases`,
  );
  const hideProjectSidebar = pathname.startsWith(`${databasesBasePath}/`);

  const dedicatedResourceInset =
    view === "database-detail" || view === "workload-detail";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header
        className={cn(
          "grid h-16 border-border border-b",
          hideProjectSidebar ? "grid-cols-1" : "md:grid-cols-[280px_1fr]",
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 p-3",
            !hideProjectSidebar && "border-border md:border-r",
          )}
        >
          <OrgSwitcher
            disabled={pending && organizations.length === 0}
            onSelectOrganization={onSelectOrganization}
            organizations={organizations}
            pending={pending}
            selectedOrganizationId={selectedOrganizationId}
          />
          <span className="text-muted-foreground text-sm">/</span>
          <ProjectSwitcher
            disabled={pending || projects.length === 0}
            onSelectProject={onSelectProject}
            project={project}
            projects={projects}
          />
        </div>

        <div
          className={cn(
            !hideProjectSidebar && "hidden md:flex",
            "flex items-center justify-end gap-2 px-4 lg:px-8",
          )}
        >
          {healthStatus === "loading" ? (
            <Badge className="gap-1.5" variant="outline">
              <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
              Checking…
            </Badge>
          ) : null}
          {healthStatus === "ok" ? (
            <Badge className="gap-1.5" variant="outline">
              <span className="size-1.5 rounded-full bg-primary" />
              All OK
            </Badge>
          ) : null}
          {healthStatus === "error" ? (
            <Badge className="gap-1.5" variant="outline">
              <span className="size-1.5 rounded-full bg-destructive" />
              Can&apos;t reach service
            </Badge>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          "grid min-h-[calc(100dvh-4rem)]",
          hideProjectSidebar ? "grid-cols-1" : "md:grid-cols-[280px_1fr]",
        )}
      >
        {hideProjectSidebar ? null : (
          <ProjectSidebar
            databases={databases}
            onSignOut={onSignOut}
            organizationSlug={organizationSlug}
            project={project}
            projectSlug={projectSlug}
            view={view}
            workloads={workloads}
          />
        )}
        <SidebarInset>
          {dedicatedResourceInset ? (
            <WorkspaceDedicatedResourceInset
              branches={branches}
              databaseDetailId={databaseDetailId}
              databases={databases}
              onCreateBranch={onCreateBranch}
              onRefreshWorkloads={onRefreshWorkloads}
              organizationSlug={organizationSlug}
              pending={pending}
              project={project}
              projectSlug={projectSlug}
              view={view}
              workloadDetailHydrationError={workloadDetailHydrationError}
              workloadDetailHydrationPending={workloadDetailHydrationPending}
              workloadDetailId={workloadDetailId}
              workloads={workloads}
            >
              {children}
            </WorkspaceDedicatedResourceInset>
          ) : (
            children
          )}
        </SidebarInset>
      </div>

      <div className="fixed right-4 bottom-4 md:hidden">
        <Button
          onClick={() => void onSignOut()}
          type="button"
          variant="outline"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </div>
    </div>
  );
}

function stripTrailingSlash(pathname: string) {
  const trimmed = pathname.replace(/\/+$/u, "");
  return trimmed.length > 0 ? trimmed : "/";
}

function WorkspaceDedicatedResourceInset({
  branches,
  children,
  databases,
  databaseDetailId,
  onCreateBranch,
  onRefreshWorkloads,
  organizationSlug,
  pending,
  project,
  projectSlug,
  view,
  workloadDetailHydrationError,
  workloadDetailHydrationPending,
  workloadDetailId,
  workloads,
}: {
  branches: WorkspaceBranch[];
  children: React.ReactNode;
  databases: DatabaseResponse[];
  databaseDetailId?: string;
  onCreateBranch: ProjectWorkspaceOutletContext["onCreateBranch"];
  onRefreshWorkloads: ProjectWorkspaceOutletContext["refreshWorkloads"];
  organizationSlug: string;
  pending: boolean;
  project: ProjectResponse | null;
  projectSlug: string;
  view: ProjectWorkspaceView;
  workloadDetailHydrationError: string | null;
  workloadDetailHydrationPending: boolean;
  workloadDetailId?: string;
  workloads: WorkloadResponse[];
}) {
  if (!project || pending) {
    return (
      <div className="flex flex-col gap-3 p-4 lg:p-8">
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Loading project…
          </CardContent>
        </Card>
      </div>
    );
  }

  const outletValue: ProjectWorkspaceOutletContext = {
    branches,
    databases,
    onCreateBranch,
    organizationSlug,
    projectSlug,
    refreshWorkloads: onRefreshWorkloads,
    workloads,
  };

  const detailDatabase =
    databaseDetailId !== undefined
      ? (databases.find((d) => d.id === databaseDetailId) ?? null)
      : null;
  const detailWorkload =
    workloadDetailId !== undefined
      ? (workloads.find((w) => w.id === workloadDetailId) ?? null)
      : null;

  if (
    view === "database-detail" &&
    databaseDetailId !== undefined &&
    detailDatabase === null
  ) {
    return (
      <ProjectOutletContext.Provider value={outletValue}>
        <div className="mx-auto w-full max-w-7xl p-4 lg:p-8">
          <Card>
            <CardHeader>
              <CardTitle>Database not found</CardTitle>
              <CardDescription>
                This database is not part of this project (or may have been
                removed).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                params={{ organizationSlug, projectSlug }}
                search={{}}
                to="/$organizationSlug/projects/$projectSlug/databases"
              >
                Back to databases
              </Link>
            </CardContent>
          </Card>
        </div>
      </ProjectOutletContext.Provider>
    );
  }

  if (
    view === "workload-detail" &&
    workloadDetailId !== undefined &&
    detailWorkload === null
  ) {
    return (
      <ProjectOutletContext.Provider value={outletValue}>
        <div className="mx-auto w-full max-w-7xl p-4 lg:p-8">
          <Card>
            <CardHeader>
              <CardTitle>Workload not found</CardTitle>
              {workloadDetailHydrationPending ? (
                <CardDescription className="text-muted-foreground">
                  Resolving workload from API…
                </CardDescription>
              ) : workloadDetailHydrationError ? (
                <CardDescription className="text-destructive">
                  {workloadDetailHydrationError}
                </CardDescription>
              ) : (
                <CardDescription>
                  This workload is not part of this project (or may have been
                  removed).
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <Link
                className={cn(buttonVariants({ size: "sm" }), "gap-1.5")}
                params={{ organizationSlug, projectSlug }}
                to="/$organizationSlug/projects/$projectSlug/workloads"
              >
                Back to workloads
              </Link>
            </CardContent>
          </Card>
        </div>
      </ProjectOutletContext.Provider>
    );
  }

  const tabBarParams =
    view === "database-detail" &&
    detailDatabase !== null &&
    databaseDetailId !== undefined
      ? {
          databaseDetailId,
          detailTitle: detailDatabase.name,
          kind: "database" as const,
        }
      : view === "workload-detail" &&
          detailWorkload !== null &&
          workloadDetailId !== undefined
        ? {
            detailTitle: detailWorkload.name,
            kind: "workload" as const,
            workloadDetailId,
          }
        : null;

  const tabBar =
    tabBarParams?.kind === "database" ? (
      <WorkspaceDatabaseTabs
        branches={branches}
        databaseId={databaseDetailId as string}
        organizationSlug={organizationSlug}
        projectSlug={projectSlug}
      />
    ) : tabBarParams?.kind === "workload" ? (
      <WorkspaceWorkloadTabs
        organizationSlug={organizationSlug}
        projectSlug={projectSlug}
        workloadId={workloadDetailId as string}
      />
    ) : (
      <p className="text-destructive text-sm">
        Resource not found in this project.
      </p>
    );

  const pathname = useRouterState({
    select: (s) => stripTrailingSlash(s.location.pathname),
  });

  const baseDbDetailPath =
    view === "database-detail" && databaseDetailId !== undefined
      ? stripTrailingSlash(
          `/${organizationSlug}/projects/${projectSlug}/databases/${databaseDetailId}`,
        )
      : null;

  const studioFullBleed =
    Boolean(baseDbDetailPath) &&
    pathname.startsWith(`${baseDbDetailPath}/`) &&
    /\/branches\/[^/]+\/(?:sql|tables)(?:\/|$)/u.test(pathname);

  return (
    <ProjectOutletContext.Provider value={outletValue}>
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col bg-background">
        {tabBarParams ? (
          <div className="border-border border-b px-4 pt-6 lg:px-8">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pb-3 text-muted-foreground text-sm">
              {tabBarParams.kind === "database" ? (
                <Link
                  className="hover:text-foreground"
                  params={{ organizationSlug, projectSlug }}
                  search={{}}
                  to="/$organizationSlug/projects/$projectSlug/databases"
                >
                  Databases
                </Link>
              ) : (
                <Link
                  className="hover:text-foreground"
                  params={{ organizationSlug, projectSlug }}
                  to="/$organizationSlug/projects/$projectSlug/workloads"
                >
                  Workloads
                </Link>
              )}
              <span aria-hidden>/</span>
              <span className="truncate font-medium text-foreground">
                {tabBarParams.detailTitle}
              </span>
              {tabBarParams.kind === "database" &&
              databaseDetailId !== undefined ? (
                <WorkspaceDatabaseBreadcrumbBranchSwitch
                  branches={branches}
                  databaseId={databaseDetailId}
                  organizationSlug={organizationSlug}
                  projectSlug={projectSlug}
                />
              ) : null}
            </div>
            {tabBar}
          </div>
        ) : (
          tabBar
        )}
        <div
          className={cn(
            "mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 lg:flex-1 lg:p-8",
            studioFullBleed &&
              "max-w-none min-h-0 flex-1 overflow-hidden lg:px-8 lg:pb-6 lg:pt-2",
          )}
        >
          {children}
        </div>
      </div>
    </ProjectOutletContext.Provider>
  );
}

interface WorkspaceDatabaseTabsProps {
  branches: WorkspaceBranch[];
  databaseId: string;
  organizationSlug: string;
  projectSlug: string;
}

function WorkspaceDatabaseTabs({
  branches,
  databaseId,
  organizationSlug,
  projectSlug,
}: WorkspaceDatabaseTabsProps) {
  const pathname = useRouterState({
    select: (s) => stripTrailingSlash(s.location.pathname),
  });

  const base = stripTrailingSlash(
    `/${organizationSlug}/projects/${projectSlug}/databases/${databaseId}`,
  );
  const branchListHref = `${base}/branches`;
  const branchesPrefix = `${branchListHref}/`;

  const isDatabaseOverview = pathname === base || pathname === `${base}/`;

  const branchStudioRest = pathname.startsWith(branchesPrefix)
    ? pathname.slice(branchesPrefix.length).replace(/\/$/u, "")
    : "";
  const studioSegments = branchStudioRest.split("/").filter(Boolean);
  const studioBranchId =
    studioSegments.length >= 2 ? (studioSegments[0] ?? null) : null;
  const studioViewRaw =
    studioSegments.length >= 2 ? (studioSegments[1] ?? null) : null;

  const dbBranches = branches.filter((row) => row.database.id === databaseId);
  const effectiveBranchId =
    studioBranchId ?? dbBranches[0]?.branch.id ?? null;

  const isLogs = pathname === `${base}/logs`;

  const linkBase = {
    organizationSlug,
    projectSlug,
    databaseId,
  };

  const studioParams =
    effectiveBranchId !== null
      ? {
          ...linkBase,
          branchId: effectiveBranchId,
        }
      : null;

  const isSqlActive = studioBranchId !== null && studioViewRaw === "sql";
  const isTablesActive =
    studioBranchId !== null && studioViewRaw === "tables";

  return (
    <nav
      aria-label="Database sections"
      className="flex flex-wrap gap-x-6 gap-y-1 border-border border-t border-dashed pt-4"
      role="tablist"
    >
      <InsetTabLink
        active={isDatabaseOverview}
        label="Overview"
        params={linkBase}
        to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/"
      />
      {studioParams ? (
        <InsetTabLink
          active={isSqlActive}
          label="SQL"
          params={{ ...studioParams, view: "sql" }}
          to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view"
        />
      ) : (
        <InsetTabMuted label="SQL" />
      )}
      {studioParams ? (
        <InsetTabLink
          active={isTablesActive}
          label="Tables"
          params={{ ...studioParams, view: "tables" }}
          to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view"
        />
      ) : (
        <InsetTabMuted label="Tables" />
      )}
      <InsetTabLink
        active={isLogs}
        label="Logs"
        params={linkBase}
        to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/logs"
      />
    </nav>
  );
}

function WorkspaceDatabaseBreadcrumbBranchSwitch({
  branches,
  databaseId,
  organizationSlug,
  projectSlug,
}: {
  branches: WorkspaceBranch[];
  databaseId: string;
  organizationSlug: string;
  projectSlug: string;
}) {
  const pathname = useRouterState({
    select: (s) => stripTrailingSlash(s.location.pathname),
  });
  const navigate = useNavigate();

  const dbRows = branches.filter((row) => row.database.id === databaseId);
  if (dbRows.length === 0) return null;

  const base = stripTrailingSlash(
    `/${organizationSlug}/projects/${projectSlug}/databases/${databaseId}`,
  );
  const branchesSlug = `${base}/branches`;
  const branchesPrefix = `${branchesSlug}/`;

  const branchStudioTail = pathname.startsWith(branchesPrefix)
    ? pathname.slice(branchesPrefix.length).replace(/\/$/u, "")
    : "";

  let studioNavigateView: "overview" | "sql" | "tables" = "overview";
  let urlBranchId: string | null = null;

  if (branchStudioTail.length > 0) {
    const segments = branchStudioTail.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const [id, rawView] = segments;
      if (
        typeof id === "string" &&
        (rawView === "overview" ||
          rawView === "sql" ||
          rawView === "tables")
      ) {
        urlBranchId = id;
        studioNavigateView = rawView;
      }
    }
  }

  const selected =
    urlBranchId !== null
      ? (dbRows.find((row) => row.branch.id === urlBranchId) ?? null)
      : null;

  const triggerLabel =
    selected !== null ? selected.branch.name : "Select branch";

  return (
    <>
      <span aria-hidden>/</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "-m-px inline-flex h-8 max-w-[min(20rem,calc(100vw-12rem))] shrink-0 items-center gap-2 rounded-md border border-border px-2.5 text-foreground text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <GitBranch className="size-3.5 shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{triggerLabel}</span>
          <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuLabel className="text-muted-foreground text-xs">
            Branch
          </DropdownMenuLabel>
          {dbRows.map(({ branch }) => (
            <DropdownMenuItem
              className="gap-2"
              key={branch.id}
              onClick={() =>
                void navigate({
                  params: {
                    branchId: branch.id,
                    databaseId,
                    organizationSlug,
                    projectSlug,
                    view:
                      urlBranchId !== null
                        ? studioNavigateView
                        : "overview",
                  },
                  search: {},
                  to: "/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view",
                })
              }
            >
              <GitBranch className="size-4 opacity-70" />
              <span className="truncate">{branch.name}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

interface WorkspaceWorkloadTabsProps {
  organizationSlug: string;
  projectSlug: string;
  workloadId: string;
}

function WorkspaceWorkloadTabs({
  organizationSlug,
  projectSlug,
  workloadId,
}: WorkspaceWorkloadTabsProps) {
  const pathname = useRouterState({
    select: (s) => stripTrailingSlash(s.location.pathname),
  });

  const base = stripTrailingSlash(
    `/${organizationSlug}/projects/${projectSlug}/workloads/${workloadId}`,
  );
  const isOverview = pathname === base || pathname === `${base}/`;
  const isDomains = pathname === `${base}/domains`;
  const isEnv = pathname === `${base}/env`;
  const isLogs = pathname === `${base}/logs`;

  const linkBase = {
    organizationSlug,
    projectSlug,
    workloadId,
  };

  return (
    <nav
      aria-label="Workload sections"
      className="flex flex-wrap gap-x-6 gap-y-1 border-border border-t border-dashed pt-4"
      role="tablist"
    >
      <InsetTabLink
        active={isOverview}
        label="Overview"
        params={linkBase}
        to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId/"
      />
      <InsetTabLink
        active={isDomains}
        label="Domains"
        params={linkBase}
        to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId/domains"
      />
      <InsetTabLink
        active={isEnv}
        label="Environment"
        params={linkBase}
        to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId/env"
      />
      <InsetTabLink
        active={isLogs}
        label="Logs"
        params={linkBase}
        to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId/logs"
      />
    </nav>
  );
}

interface InsetTabLinkProps {
  active: boolean;
  label: string;
  params: Record<string, string>;
  to: string;
}

function InsetTabLink({ active, label, params, to }: InsetTabLinkProps) {
  return (
    <Link
      aria-selected={active}
      className={cn(
        "inline-flex shrink-0 border-b-2 px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        active
          ? "border-foreground font-medium text-foreground"
          : "cursor-pointer border-transparent text-muted-foreground hover:text-foreground",
      )}
      params={params}
      role="tab"
      to={to}
    >
      {label}
    </Link>
  );
}

function InsetTabMuted({ label }: { label: string }) {
  return (
    <span
      aria-disabled
      aria-selected={false}
      className="inline-flex shrink-0 cursor-not-allowed border-transparent border-b-2 px-3 py-2.5 text-muted-foreground text-sm opacity-50"
      role="tab"
    >
      {label}
    </span>
  );
}

interface ProjectSwitcherProps {
  disabled: boolean;
  onSelectProject: (projectSlug: string) => void;
  project: ProjectResponse | null;
  projects: ProjectResponse[];
}

function ProjectSwitcher({
  disabled,
  onSelectProject,
  project,
  projects,
}: ProjectSwitcherProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "min-w-0 justify-start",
        )}
        disabled={disabled}
      >
        <span className="truncate">{project?.name ?? "Project"}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Projects
        </DropdownMenuLabel>
        {projects.map((item) => (
          <DropdownMenuItem
            className="gap-2 p-2"
            key={item.id}
            onClick={() => onSelectProject(item.slug)}
          >
            <Boxes className="size-4 opacity-70" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{item.name}</span>
              <span className="truncate text-muted-foreground text-xs">
                {item.slug}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ProjectSidebarProps {
  databases: DatabaseResponse[];
  onSignOut: () => void;
  organizationSlug: string;
  project: ProjectResponse | null;
  projectSlug: string;
  view: ProjectWorkspaceView;
  workloads: WorkloadResponse[];
}

function ProjectSidebar({
  databases,
  onSignOut,
  organizationSlug,
  project,
  projectSlug,
  view,
  workloads,
}: ProjectSidebarProps) {
  const serviceCount = databases.length + workloads.length;

  return (
    <Sidebar className="min-h-0">
      <SidebarContent>
        <SidebarGroup className="space-y-3">
          <div className="px-2">
            <p className="truncate font-medium">{project?.name ?? "Project"}</p>
            <p className="text-muted-foreground text-xs">
              {pluralize(serviceCount, "service")}
            </p>
          </div>

          <SidebarMenu>
            <SidebarMenuItem>
              <WorkspaceNavLink
                active={view === "dashboard"}
                params={{ organizationSlug, projectSlug }}
                to="/$organizationSlug/projects/$projectSlug"
              >
                <LayoutDashboard className="size-4" />
                Overview
              </WorkspaceNavLink>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <WorkspaceNavLink
                active={view === "services"}
                params={{ organizationSlug, projectSlug }}
                to="/$organizationSlug/projects/$projectSlug/services"
              >
                <Boxes className="size-4" />
                <span>Services</span>
                {serviceCount > 0 ? (
                  <span className="ml-auto text-muted-foreground text-xs">
                    {serviceCount}
                  </span>
                ) : null}
              </WorkspaceNavLink>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <WorkspaceNavLink
                active={view === "databases" || view === "database-detail"}
                params={{ organizationSlug, projectSlug }}
                search={{}}
                to="/$organizationSlug/projects/$projectSlug/databases"
              >
                <Database className="size-4" />
                <span>Databases</span>
                {databases.length > 0 ? (
                  <span className="ml-auto text-muted-foreground text-xs">
                    {databases.length}
                  </span>
                ) : null}
              </WorkspaceNavLink>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <WorkspaceNavLink
                active={view === "workloads" || view === "workload-detail"}
                params={{ organizationSlug, projectSlug }}
                to="/$organizationSlug/projects/$projectSlug/workloads"
              >
                <Workflow className="size-4" />
                <span>Workloads</span>
                {workloads.length > 0 ? (
                  <span className="ml-auto text-muted-foreground text-xs">
                    {workloads.length}
                  </span>
                ) : null}
              </WorkspaceNavLink>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <Button
          className="w-full justify-start"
          onClick={() => void onSignOut()}
          type="button"
          variant="ghost"
        >
          <LogOut className="size-4" />
          Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}

interface WorkspaceNavLinkProps {
  active: boolean;
  children: React.ReactNode;
  params: Record<string, string>;
  search?: Record<string, string | undefined>;
  to: string;
}

function WorkspaceNavLink({
  active,
  children,
  params,
  search,
  to,
}: WorkspaceNavLinkProps) {
  return (
    <Link
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      params={params}
      search={search}
      to={to}
    >
      {children}
    </Link>
  );
}

interface ProjectWorkspaceContentProps {
  branches: WorkspaceBranch[];
  databases: DatabaseResponse[];
  errorMessage: string | null;
  focusedDatabaseId?: string;
  loading: boolean;
  onCreateBranch: (input: {
    copyMode: BranchCopyMode;
    databaseId: string;
    expirationTtl?: BranchExpirationTtl;
    name: string;
    parentBranchId?: string;
  }) => Promise<void>;
  onCreateWorkload: (input: CreateWorkloadRequest) => Promise<void>;
  organizationSlug: string;
  project: ProjectResponse | null;
  projectSlug: string;
  selectedBranch: WorkspaceBranch | null;
  view: ProjectWorkspaceView;
  workloads: WorkloadResponse[];
}

function viewDescription(
  view: ProjectWorkspaceView,
  project: ProjectResponse | null,
  selectedBranch: WorkspaceBranch | null,
  focusedDatabaseId?: string,
): string {
  switch (view) {
    case "dashboard":
      return `Overview of ${project?.name ?? "this project"}.`;
    case "services":
      return "All databases, containers and functions running in this project.";
    case "databases":
      return focusedDatabaseId
        ? "Open any database tile to inspect branches and use the studio from the tabs along the top."
        : "Postgres clusters for this project. Pick a database to manage branches.";
    case "workloads":
      return "Container services and functions.";
    case "branches":
      return focusedDatabaseId
        ? "Branches for the highlighted database cluster on the databases page."
        : "Branch lists and tools live inside each database. Open Databases first.";
    case "database-detail":
      return "Focused workspace for one Postgres cluster, with branches and operations.";
    case "workload-detail":
      return "Focused workspace for one container or function.";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

function ProjectWorkspaceContent({
  branches,
  databases,
  errorMessage,
  focusedDatabaseId,
  loading,
  onCreateBranch,
  onCreateWorkload,
  organizationSlug,
  project,
  projectSlug,
  selectedBranch,
  view,
  workloads,
}: ProjectWorkspaceContentProps) {
  return (
    <div className="flex flex-col gap-6 p-4 lg:mx-auto lg:max-w-7xl lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {viewLabel(view)}
          </h1>
          <p className="text-muted-foreground text-sm">
            {viewDescription(view, project, selectedBranch, focusedDatabaseId)}
          </p>
        </div>
        {project ? (
          <div className="flex flex-wrap items-center gap-2">
            {view === "branches" && focusedDatabaseId ? (
              <CreateBranchModal
                databases={databases.filter((d) => d.id === focusedDatabaseId)}
                onCreateBranch={onCreateBranch}
                selectedBranch={selectedBranch}
              />
            ) : null}
            <Badge className="gap-1.5" variant="outline">
              <Hash className="size-3" />
              {project.slug}
            </Badge>
          </div>
        ) : null}
      </div>

      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="text-muted-foreground py-6 text-sm">
            Loading project…
          </CardContent>
        </Card>
      ) : project ? (
        <>
          <ProvisioningStatusCard databases={databases} workloads={workloads} />
          {view === "dashboard" ? (
            <ProjectOverview
              branches={branches}
              databases={databases}
              organizationSlug={organizationSlug}
              project={project}
              projectSlug={projectSlug}
              selectedBranch={selectedBranch}
              workloads={workloads}
            />
          ) : view === "services" ? (
            <ServicesPanel
              databases={databases}
              organizationSlug={organizationSlug}
              projectSlug={projectSlug}
              workloads={workloads}
            />
          ) : view === "databases" ? (
            <DatabasesPanel
              databases={databases}
              focusedDatabaseId={focusedDatabaseId}
              organizationSlug={organizationSlug}
              projectSlug={projectSlug}
            />
          ) : view === "workloads" ? (
            <WorkloadsPanel
              errorMessage={null}
              navigation={{
                organizationSlug,
                projectSlug,
              }}
              onCreateWorkload={onCreateWorkload}
              workloads={workloads}
            />
          ) : view === "branches" ? (
            focusedDatabaseId ? (
              <ProjectBranches
                branches={branches.filter(
                  (item) => item.database.id === focusedDatabaseId,
                )}
                linkBase={{
                  databaseId: focusedDatabaseId,
                  organizationSlug,
                  projectSlug,
                }}
              />
            ) : (
              <Card>
                <CardContent className="flex flex-col gap-3 py-10 text-center text-sm">
                  <p className="text-muted-foreground">
                    Branch management is scoped to a single database. Go to{" "}
                    <Link
                      className="text-foreground underline"
                      params={{ organizationSlug, projectSlug }}
                      search={{}}
                      to="/$organizationSlug/projects/$projectSlug/databases"
                    >
                      Databases
                    </Link>
                    , open one, and use its{" "}
                    <span className="text-foreground font-medium">
                      Overview
                    </span>{" "}
                    to manage branches.
                  </p>
                </CardContent>
              </Card>
            )
          ) : (
            (() => {
              const exhaustive: never = view;
              return exhaustive;
            })()
          )}
        </>
      ) : null}
    </div>
  );
}

function ProvisioningStatusCard({
  databases,
  workloads,
}: {
  databases: DatabaseResponse[];
  workloads: WorkloadResponse[];
}) {
  const trackedDatabases = databases.filter(
    (database) =>
      database.status === "requested" ||
      database.status === "provisioning" ||
      database.status === "failed" ||
      database.branches.some(
        (branch) =>
          branch.status === "requested" ||
          branch.status === "creating" ||
          branch.status === "failed",
      ),
  );

  const trackedWorkloads = workloads.filter(
    (workload) =>
      workload.status === "requested" ||
      workload.status === "provisioning" ||
      workload.status === "failed",
  );

  if (trackedDatabases.length === 0 && trackedWorkloads.length === 0) {
    return null;
  }

  const hasActiveWork = hasActiveProvisioning(databases, workloads);

  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">
              {hasActiveWork
                ? "Provisioning in progress"
                : "Provisioning status"}
            </CardTitle>
            <CardDescription>
              {hasActiveWork
                ? "Background workflow updates are refreshing automatically."
                : "Review the latest workflow result before continuing."}
            </CardDescription>
          </div>
          {hasActiveWork ? (
            <Badge className="gap-1.5" variant="outline">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Live
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {trackedDatabases.map((database) => (
          <div
            className="rounded-lg border border-border bg-muted/30 p-3"
            key={database.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{database.name}</p>
                <p className="text-muted-foreground text-xs">
                  Database workflow
                </p>
              </div>
              <Badge variant="outline">{database.status}</Badge>
            </div>
            {database.branches.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {database.branches.map((branch) => (
                  <Badge className="gap-1.5" key={branch.id} variant="outline">
                    <GitBranch className="size-3" />
                    {branch.name}: {branch.status}
                  </Badge>
                ))}
              </div>
            ) : null}
            {database.endpoint ? (
              <p className="text-muted-foreground mt-3 text-xs">
                Endpoint ready at {database.endpoint.hostname}:
                {database.endpoint.port}
              </p>
            ) : (
              <p className="text-muted-foreground mt-3 text-xs">
                Waiting for an endpoint from the data plane.
              </p>
            )}
          </div>
        ))}
        {trackedWorkloads.map((workload) => (
          <div
            className="rounded-lg border border-border bg-muted/30 p-3"
            key={workload.id}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{workload.name}</p>
                <p className="text-muted-foreground text-xs">
                  {workloadKindLabel(workload.kind)}
                </p>
              </div>
              <Badge variant="outline">{workload.status}</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

interface ProjectOverviewProps {
  branches: WorkspaceBranch[];
  databases: DatabaseResponse[];
  organizationSlug: string;
  project: ProjectResponse;
  projectSlug: string;
  selectedBranch: WorkspaceBranch | null;
  workloads: WorkloadResponse[];
}

function ProjectOverview({
  branches,
  databases,
  organizationSlug,
  project,
  projectSlug,
  selectedBranch,
  workloads,
}: ProjectOverviewProps) {
  const branchCount = countBranches(databases);
  const services: ServiceItem[] = [
    ...databases.map(
      (database): ServiceItem => ({
        kind: "database",
        record: database,
      }),
    ),
    ...workloads.map(
      (workload): ServiceItem => ({
        kind: "workload",
        record: workload,
      }),
    ),
  ];

  return (
    <>
      <ConnectButton branches={branches} selectedBranch={selectedBranch} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Boxes className="text-muted-foreground size-4" />}
          label="Services"
          value={services.length.toString()}
        />
        <SummaryCard
          icon={<Database className="text-muted-foreground size-4" />}
          label="Databases"
          value={databases.length.toString()}
        />
        <SummaryCard
          icon={<Workflow className="text-muted-foreground size-4" />}
          label="Workloads"
          value={workloads.length.toString()}
        />
        <SummaryCard
          icon={<GitBranch className="text-muted-foreground size-4" />}
          label="Branches"
          value={branchCount.toString()}
        />
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg tracking-tight">Services</h2>
          <Link
            className="text-muted-foreground text-sm hover:text-foreground"
            params={{ organizationSlug, projectSlug }}
            to="/$organizationSlug/projects/$projectSlug/services"
          >
            View all →
          </Link>
        </div>
        {services.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-sm">
              No services yet. Open the{" "}
              <Link
                className="text-foreground underline"
                params={{ organizationSlug, projectSlug }}
                to="/$organizationSlug/projects/$projectSlug/workloads"
              >
                Workloads
              </Link>{" "}
              tab to add one.
            </CardContent>
          </Card>
        ) : (
          <ServicesGrid
            organizationSlug={organizationSlug}
            projectSlug={projectSlug}
            services={services.slice(0, 6)}
          />
        )}
      </div>
    </>
  );
}

type ServiceItem =
  | { kind: "database"; record: DatabaseResponse }
  | { kind: "workload"; record: WorkloadResponse };

interface ServicesPanelProps {
  databases: DatabaseResponse[];
  organizationSlug: string;
  projectSlug: string;
  workloads: WorkloadResponse[];
}

function ServicesPanel({
  databases,
  organizationSlug,
  projectSlug,
  workloads,
}: ServicesPanelProps) {
  const [filter, setFilter] = React.useState<"all" | "database" | "workload">(
    "all",
  );
  const services: ServiceItem[] = [
    ...databases.map(
      (database): ServiceItem => ({
        kind: "database",
        record: database,
      }),
    ),
    ...workloads.map(
      (workload): ServiceItem => ({
        kind: "workload",
        record: workload,
      }),
    ),
  ];
  const filtered = services.filter((service) =>
    filter === "all" ? true : service.kind === filter,
  );

  if (services.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/40">
            <Boxes className="text-muted-foreground size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">No services yet</p>
            <p className="text-muted-foreground text-sm">
              Add a database or workload to power this project.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link
              className={cn(buttonVariants({ size: "sm" }))}
              params={{ organizationSlug, projectSlug }}
              to="/$organizationSlug/projects/$projectSlug/workloads"
            >
              <Workflow className="size-4" />
              Add workload
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filter === "all"}
          label={`All (${services.length})`}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          active={filter === "database"}
          icon={<Database className="size-3.5" />}
          label={`Databases (${databases.length})`}
          onClick={() => setFilter("database")}
        />
        <FilterChip
          active={filter === "workload"}
          icon={<Workflow className="size-3.5" />}
          label={`Workloads (${workloads.length})`}
          onClick={() => setFilter("workload")}
        />
      </div>
      <ServicesGrid
        organizationSlug={organizationSlug}
        projectSlug={projectSlug}
        services={filtered}
      />
    </div>
  );
}

function FilterChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function ResourceCardKeyRow({ label, value }: { label: string; value: string }) {
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

function ServicesGrid({
  organizationSlug,
  projectSlug,
  services,
}: {
  organizationSlug: string;
  projectSlug: string;
  services: ServiceItem[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {services.map((service) =>
        service.kind === "database" ? (
          <DatabaseServiceCard
            database={service.record}
            key={service.record.id}
            organizationSlug={organizationSlug}
            projectSlug={projectSlug}
          />
        ) : (
          <WorkloadServiceCard
            key={service.record.id}
            organizationSlug={organizationSlug}
            projectSlug={projectSlug}
            workload={service.record}
          />
        ),
      )}
    </div>
  );
}

function DatabaseServiceCard({
  database,
  organizationSlug,
  projectSlug,
}: {
  database: DatabaseResponse;
  organizationSlug: string;
  projectSlug: string;
}) {
  return (
    <Link
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      params={{
        databaseId: database.id,
        organizationSlug,
        projectSlug,
      }}
      to="/$organizationSlug/projects/$projectSlug/databases/$databaseId"
    >
      <Card className="h-full transition-colors hover:bg-muted/30">
        <CardHeader>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <Database className="text-muted-foreground size-4" />
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-base">
                  {database.name}
                </CardTitle>
                <CardDescription>Postgres {database.postgresVersion}</CardDescription>
              </div>
            </div>
            <DatabaseStatusBadge status={database.status} />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ResourceCardKeyRow
            label="Endpoint"
            value={database.endpoint?.hostname ?? "—"}
          />
          <ResourceCardKeyRow
            label="Branches"
            value={String(database.branches.length)}
          />
        </CardContent>
      </Card>
    </Link>
  );
}

function WorkloadServiceCard({
  organizationSlug,
  projectSlug,
  workload,
}: {
  organizationSlug: string;
  projectSlug: string;
  workload: WorkloadResponse;
}) {
  const Icon = workloadKindIcon(workload.kind);
  const error = workloadObservedError(workload);

  return (
    <Link
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      params={{
        organizationSlug,
        projectSlug,
        workloadId: workload.id,
      }}
      to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId"
    >
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
          <ResourceCardKeyRow
            label={
              workload.kind === "container" ? "Image" : "Runtime"
            }
            value={
              workload.kind === "container"
                ? typeof workload.desiredState.image === "string"
                  ? workload.desiredState.image
                  : "—"
                : typeof workload.desiredState.runtime === "string"
                  ? workload.desiredState.runtime
                  : "—"
            }
          />
          {error ? (
            <p className="text-destructive flex items-start gap-1.5 text-xs leading-snug">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

function DatabaseStatusBadge({
  status,
}: {
  status: DatabaseResponse["status"];
}) {
  const tone: WorkloadResponse["status"] = (() => {
    switch (status) {
      case "available":
        return "available";
      case "requested":
      case "provisioning":
        return "provisioning";
      case "degraded":
        return "degraded";
      case "maintenance":
        return "maintenance";
      case "failed":
      case "deleted":
        return "failed";
      default: {
        const exhaustive: never = status;
        return exhaustive;
      }
    }
  })();

  return <StatusDot status={tone} />;
}

function DatabasesPanel({
  databases,
  focusedDatabaseId,
  organizationSlug,
  projectSlug,
}: {
  databases: DatabaseResponse[];
  focusedDatabaseId?: string;
  organizationSlug: string;
  projectSlug: string;
}) {
  if (databases.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/40">
            <Database className="text-muted-foreground size-6" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-sm">No databases yet</p>
            <p className="text-muted-foreground text-sm">
              Create one to start adding branches.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {databases.map((database) => (
        <Link
          className={cn(
            "block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            focusedDatabaseId === database.id &&
              "ring-2 ring-primary/35 ring-offset-2 ring-offset-background",
          )}
          key={database.id}
          params={{
            databaseId: database.id,
            organizationSlug,
            projectSlug,
          }}
          to="/$organizationSlug/projects/$projectSlug/databases/$databaseId"
        >
          <Card className="h-full transition-colors hover:bg-muted/30">
            <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <Database className="text-muted-foreground size-4" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate text-base">
                      {database.name}
                    </CardTitle>
                    <CardDescription>
                      Postgres {database.postgresVersion}
                    </CardDescription>
                  </div>
                </div>
                <DatabaseStatusBadge status={database.status} />
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              <ResourceCardKeyRow
                label="Endpoint"
                value={database.endpoint?.hostname ?? "—"}
              />
              <ResourceCardKeyRow
                label="Branches"
                value={String(database.branches.length)}
              />
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function buildMaskedConnectionString(selectedBranch: WorkspaceBranch | null) {
  const endpoint = selectedBranch?.database.endpoint;

  if (!selectedBranch || !endpoint) {
    return "No endpoint is available for this branch yet.";
  }

  const isLocalEndpoint =
    endpoint.hostname === "localhost" ||
    endpoint.hostname === "127.0.0.1" ||
    endpoint.hostname.endsWith(".local.openbika.test");
  const branchToken = selectedBranch.branch.id
    .replace(/^br_/, "")
    .replaceAll("-", "")
    .slice(0, 12)
    .toLowerCase();
  const hostname = isLocalEndpoint ? "localhost" : endpoint.hostname;
  const databaseName = isLocalEndpoint
    ? `openbika_${branchToken}`
    : selectedBranch.database.name;
  const username = isLocalEndpoint ? `${databaseName}_owner` : "postgres";

  return `postgresql://${username}:********@${hostname}:${endpoint.port}/${databaseName}`;
}

function ConnectButton({
  branches,
  selectedBranch,
}: {
  branches: WorkspaceBranch[];
  selectedBranch: WorkspaceBranch | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [modalBranchId, setModalBranchId] = React.useState(
    selectedBranch?.branch.id ?? "",
  );
  const [showConnection, setShowConnection] = React.useState(false);
  const [connection, setConnection] =
    React.useState<BranchConnectionResponse | null>(null);
  const [connectionError, setConnectionError] = React.useState<string | null>(
    null,
  );
  const [revealed, setRevealed] = React.useState(false);
  const [revealing, setRevealing] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const modalBranch =
    branches.find((item) => item.branch.id === modalBranchId) ??
    selectedBranch ??
    null;
  const maskedConnectionString =
    connection?.maskedConnectionString ??
    buildMaskedConnectionString(modalBranch);
  const connectionString = revealed
    ? (connection?.connectionString ?? maskedConnectionString)
    : maskedConnectionString;

  React.useEffect(() => {
    setModalBranchId(selectedBranch?.branch.id ?? "");
  }, [selectedBranch?.branch.id]);

  React.useEffect(() => {
    setConnection(null);
    setConnectionError(null);
    setRevealed(false);
    setRevealing(false);
    setCopying(false);
    setCopied(false);
    setShowConnection(false);
  }, [modalBranchId]);

  async function loadConnectionString() {
    if (!modalBranch) return null;
    if (connection?.connectionString) return connection.connectionString;

    setRevealing(true);
    setConnectionError(null);

    try {
      const client = getDashboardApiClient();
      const nextConnection = await client.getBranchConnection(
        modalBranch.branch.id,
      );
      setConnection(nextConnection);
      return nextConnection.connectionString;
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : "Failed to load connection string",
      );
      return null;
    } finally {
      setRevealing(false);
    }
  }

  async function handleToggleReveal() {
    if (!modalBranch) return;

    if (revealed) {
      setRevealed(false);
      return;
    }

    const nextConnectionString = await loadConnectionString();
    if (!nextConnectionString) return;

    setRevealed(true);
  }

  async function handleCopyConnection() {
    if (!modalBranch) return;

    setCopying(true);
    setCopied(false);
    setConnectionError(null);

    try {
      const nextConnectionString = await loadConnectionString();
      if (!nextConnectionString) return;

      await navigator.clipboard.writeText(nextConnectionString);
      setRevealed(true);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : "Failed to copy connection string",
      );
    } finally {
      setCopying(false);
    }
  }

  return (
    <>
      <div>
        <Button
          disabled={branches.length === 0}
          onClick={() => setOpen(true)}
          type="button"
        >
          <Database className="size-4" />
          Connect
        </Button>
      </div>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
        >
          <div className="w-full max-w-xl rounded-xl border border-border bg-card text-card-foreground shadow-lg">
            <div className="flex items-start justify-between gap-4 border-border border-b p-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  Connect
                </h2>
                <p className="text-muted-foreground text-sm">
                  Select a branch and view its connection string.
                </p>
              </div>
              <Button
                aria-label="Close connect modal"
                onClick={() => setOpen(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="space-y-5 p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium">Branch</p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full justify-start",
                    )}
                    disabled={branches.length === 0}
                  >
                    <GitBranch className="size-4" />
                    <span className="truncate">
                      {modalBranch?.branch.name ?? "Select branch"}
                    </span>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-72">
                    <DropdownMenuLabel className="text-muted-foreground text-xs">
                      Branches
                    </DropdownMenuLabel>
                    {branches.map(({ branch, database }) => (
                      <DropdownMenuItem
                        className="gap-2 p-2"
                        key={branch.id}
                        onClick={() => setModalBranchId(branch.id)}
                      >
                        <GitBranch className="size-4 opacity-70" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {branch.name}
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            {database.name} · {branch.status}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {modalBranch ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="gap-1.5" variant="outline">
                    <Database className="size-3" />
                    {modalBranch.database.name}
                  </Badge>
                  <Badge className="gap-1.5" variant="outline">
                    <GitBranch className="size-3" />
                    {modalBranch.branch.name}
                  </Badge>
                </div>
              ) : null}

              {!showConnection ? (
                <Button
                  disabled={!modalBranch}
                  onClick={() => setShowConnection(true)}
                  type="button"
                  variant="secondary"
                >
                  View connection string
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-sm font-medium">Connection string</p>
                  <code className="block overflow-x-auto rounded-lg border border-border bg-background p-3 text-sm">
                    {connectionString}
                  </code>
                  <div className="flex justify-end gap-2">
                    <Button
                      aria-label={revealed ? "Hide password" : "Show password"}
                      disabled={!modalBranch || revealing || copying}
                      onClick={() => void handleToggleReveal()}
                      size="icon-sm"
                      title={revealed ? "Hide password" : "Show password"}
                      type="button"
                      variant="outline"
                    >
                      {revealed ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </Button>
                    <Button
                      aria-label="Copy connection string"
                      disabled={!modalBranch || revealing || copying}
                      onClick={() => void handleCopyConnection()}
                      size="icon-sm"
                      title="Copy connection string"
                      type="button"
                      variant="outline"
                    >
                      {copied ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                    </Button>
                  </div>
                  {connectionError ? (
                    <p className="text-destructive text-sm" role="alert">
                      {connectionError}
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function CreateBranchModal({
  databases,
  onCreateBranch,
  selectedBranch,
}: {
  databases: DatabaseResponse[];
  onCreateBranch: (input: {
    copyMode: BranchCopyMode;
    databaseId: string;
    expirationTtl?: BranchExpirationTtl;
    name: string;
    parentBranchId?: string;
  }) => Promise<void>;
  selectedBranch: WorkspaceBranch | null;
}) {
  const defaultDatabaseId =
    selectedBranch?.database.id ?? databases[0]?.id ?? "";
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [databaseId, setDatabaseId] = React.useState(defaultDatabaseId);
  const [parentBranchId, setParentBranchId] = React.useState("");
  const [copyMode, setCopyMode] = React.useState<BranchCopyMode>("schema_only");
  const [expirationTtl, setExpirationTtl] = React.useState<
    BranchExpirationTtl | ""
  >("");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const selectedDatabase =
    databases.find((database) => database.id === databaseId) ??
    databases[0] ??
    null;
  const parentBranches = (selectedDatabase?.branches ?? []).filter(
    (branch) => branch.expiresAt === null && branch.status === "ready",
  );
  const selectedParent =
    parentBranches.find((branch) => branch.id === parentBranchId) ?? null;

  React.useEffect(() => {
    if (
      !databaseId ||
      !databases.some((database) => database.id === databaseId)
    ) {
      setDatabaseId(defaultDatabaseId);
    }
  }, [databaseId, databases, defaultDatabaseId]);

  React.useEffect(() => {
    if (
      parentBranchId &&
      !parentBranches.some((branch) => branch.id === parentBranchId)
    ) {
      setParentBranchId("");
    }
  }, [parentBranchId, parentBranches]);

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setName("");
    setErrorMessage(null);
    setDatabaseId(defaultDatabaseId);
    setParentBranchId("");
    setCopyMode("schema_only");
    setExpirationTtl("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setErrorMessage("Branch name is required.");
      return;
    }

    if (!selectedDatabase) {
      setErrorMessage("Create a database before adding branches.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await onCreateBranch({
        copyMode: selectedParent ? copyMode : "schema_only",
        databaseId: selectedDatabase.id,
        expirationTtl: expirationTtl || undefined,
        name: trimmedName,
        parentBranchId: parentBranchId || undefined,
      });
      setOpen(false);
      setName("");
      setErrorMessage(null);
      setDatabaseId(defaultDatabaseId);
      setParentBranchId("");
      setCopyMode("schema_only");
      setExpirationTtl("");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create branch",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button
        disabled={databases.length === 0}
        onClick={() => setOpen(true)}
        type="button"
      >
        <Plus className="size-4" />
        New branch
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
                  Create branch
                </h2>
                <p className="text-muted-foreground text-sm">
                  Add a branch to one of this project&apos;s databases.
                </p>
              </div>
              <Button
                aria-label="Close create branch modal"
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
                <label className="text-sm font-medium" htmlFor="branch-name">
                  Branch name
                </label>
                <Input
                  autoFocus
                  id="branch-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="preview"
                  value={name}
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Database</p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full justify-start",
                    )}
                    disabled={databases.length === 0 || submitting}
                  >
                    <Database className="size-4" />
                    <span className="truncate">
                      {selectedDatabase?.name ?? "Select database"}
                    </span>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-72">
                    <DropdownMenuLabel className="text-muted-foreground text-xs">
                      Databases
                    </DropdownMenuLabel>
                    {databases.map((database) => (
                      <DropdownMenuItem
                        className="gap-2 p-2"
                        key={database.id}
                        onClick={() => {
                          setDatabaseId(database.id);
                          setParentBranchId("");
                        }}
                      >
                        <Database className="size-4 opacity-70" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {database.name}
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            {pluralize(
                              database.branches.length,
                              "branch",
                              "branches",
                            )}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Parent branch</p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full justify-start",
                    )}
                    disabled={!selectedDatabase || submitting}
                  >
                    <GitBranch className="size-4" />
                    <span className="truncate">
                      {selectedParent?.name ?? "No parent"}
                    </span>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-72">
                    <DropdownMenuLabel className="text-muted-foreground text-xs">
                      Parent branch
                    </DropdownMenuLabel>
                    <DropdownMenuItem
                      className="gap-2 p-2"
                      onClick={() => setParentBranchId("")}
                    >
                      <GitBranch className="size-4 opacity-70" />
                      No parent
                    </DropdownMenuItem>
                    {parentBranches.map((branch) => (
                      <DropdownMenuItem
                        className="gap-2 p-2"
                        key={branch.id}
                        onClick={() => setParentBranchId(branch.id)}
                      >
                        <GitBranch className="size-4 opacity-70" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            {branch.name}
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            {branchCopyModeLabel(branch.copyMode)} ·{" "}
                            {branch.status}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-muted-foreground text-xs">
                  Branches with expiration dates cannot be used as parents.
                </p>
              </div>

              {selectedParent ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Copy mode</p>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      className={cn(
                        buttonVariants({ variant: "outline" }),
                        "w-full justify-start",
                      )}
                      disabled={submitting}
                    >
                      <Copy className="size-4" />
                      <span className="truncate">
                        {branchCopyModeLabel(copyMode)}
                      </span>
                      <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-72">
                      <DropdownMenuLabel className="text-muted-foreground text-xs">
                        Copy mode
                      </DropdownMenuLabel>
                      <DropdownMenuItem
                        className="gap-2 p-2"
                        onClick={() => setCopyMode("schema_only")}
                      >
                        <Copy className="size-4 opacity-70" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            Schema only
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            Copy tables and structure without row data.
                          </span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="gap-2 p-2"
                        onClick={() => setCopyMode("schema_and_data")}
                      >
                        <Database className="size-4 opacity-70" />
                        <div className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">
                            Schema + current data
                          </span>
                          <span className="truncate text-muted-foreground text-xs">
                            Clone the parent branch as it is now.
                          </span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium">Expiration</p>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full justify-start",
                    )}
                    disabled={submitting}
                  >
                    <Clock className="size-4" />
                    <span className="truncate">
                      {expirationTtlLabel(expirationTtl)}
                    </span>
                    <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-72">
                    <DropdownMenuLabel className="text-muted-foreground text-xs">
                      Expiration
                    </DropdownMenuLabel>
                    {(["", "1h", "1d", "7d"] as const).map((ttl) => (
                      <DropdownMenuItem
                        className="gap-2 p-2"
                        key={ttl || "none"}
                        onClick={() => setExpirationTtl(ttl)}
                      >
                        <Clock className="size-4 opacity-70" />
                        {expirationTtlLabel(ttl)}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                {submitting ? "Creating…" : "Create branch"}
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}

export function DatabaseResourceOverviewOutlet({
  databaseId,
}: {
  databaseId: string;
}) {
  const { branches, databases, onCreateBranch, organizationSlug, projectSlug } =
    useProjectWorkspaceOutlet();

  const database = databases.find((item) => item.id === databaseId) ?? null;
  const studioBranchAnchor =
    branches.find((row) => row.database.id === databaseId) ?? null;

  if (!database) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          Database metadata is unavailable yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
            <Database className="text-muted-foreground size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-xl tracking-tight">
              {database.name}
            </h2>
            <p className="text-muted-foreground text-sm">
              Postgres {database.postgresVersion}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <DatabaseStatusBadge status={database.status} />
          <CreateBranchModal
            databases={[database]}
            onCreateBranch={onCreateBranch}
            selectedBranch={studioBranchAnchor}
          />
        </div>
      </div>

      {database.branches.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-dashed border-border bg-muted/40">
              <GitBranch className="text-muted-foreground size-6" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm">No branches yet</p>
              <p className="text-muted-foreground text-sm">
                Provision or create one to open SQL and the table browser for
                this database.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {database.branches.map((branch) => (
            <Card key={branch.id} className="h-full rounded-xl shadow-none transition-colors hover:bg-muted/30">
              <CardHeader>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                      <GitBranch className="text-muted-foreground size-4" />
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base">
                        {branch.name}
                      </CardTitle>
                      <CardDescription>
                        {branchCopyModeLabel(branch.copyMode)}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="outline">{branch.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3">
                <ResourceCardKeyRow
                  label="Parent"
                  value={branch.parentBranchId ?? "None"}
                />
                <ResourceCardKeyRow
                  label="Expiration"
                  value={branchExpirationLabel(branch.expiresAt)}
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Link
                    className={cn(
                      buttonVariants({ size: "sm", variant: "default" }),
                      "grow gap-1.5 sm:grow-0",
                    )}
                    params={{
                      branchId: branch.id,
                      databaseId,
                      organizationSlug,
                      projectSlug,
                      view: "sql",
                    }}
                    to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view"
                  >
                    <Code2 className="size-4" />
                    SQL
                  </Link>
                  <Link
                    className={cn(
                      buttonVariants({ size: "sm", variant: "outline" }),
                      "grow gap-1.5 sm:grow-0",
                    )}
                    params={{
                      branchId: branch.id,
                      databaseId,
                      organizationSlug,
                      projectSlug,
                      view: "tables",
                    }}
                    to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view"
                  >
                    <Table2 className="size-4" />
                    Tables
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function DatabaseResourcePlaceholderOutlet({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

export function WorkloadResourceOverviewOutlet({
  workloadId,
}: {
  workloadId: string;
}) {
  const { workloads, refreshWorkloads } = useProjectWorkspaceOutlet();

  const workload = workloads.find((item) => item.id === workloadId) ?? null;

  const [rebuildPending, setRebuildPending] = React.useState(false);
  const [rebuildError, setRebuildError] = React.useState<string | null>(null);

  const busyProvisioning =
    workload?.status === "provisioning" || workload?.status === "requested";

  async function rebuild() {
    if (workload === null) return;
    setRebuildPending(true);
    setRebuildError(null);
    try {
      const client = getDashboardApiClient();
      await client.rebuildWorkload(workloadId);
      await refreshWorkloads();
    } catch (err) {
      setRebuildError(
        err instanceof Error ? err.message : "Rebuild could not be started",
      );
    } finally {
      setRebuildPending(false);
    }
  }

  if (!workload) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          Workload metadata is unavailable yet.
        </CardContent>
      </Card>
    );
  }

  const Icon = workloadKindIcon(workload.kind);
  const error = workloadObservedError(workload);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                <Icon className="text-muted-foreground size-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="truncate text-xl">
                  {workload.name}
                </CardTitle>
                <CardDescription>
                  {workloadKindLabel(workload.kind)}
                </CardDescription>
              </div>
            </div>
            <div className="flex max-w-full min-w-0 flex-col items-end gap-2">
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  aria-busy={rebuildPending}
                  className="gap-1.5"
                  disabled={rebuildPending || busyProvisioning}
                  onClick={() => void rebuild()}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <RotateCcw
                    className={cn("size-4", rebuildPending && "animate-spin")}
                    aria-hidden
                  />
                  Rebuild
                </Button>
                <StatusDot status={workload.status} />
              </div>
              {rebuildError !== null ? (
                <p
                  className="max-w-[min(100%,21rem)] break-words text-right text-destructive text-xs leading-snug"
                  role="alert"
                >
                  {rebuildError}
                </p>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {workload.kind === "container" ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground uppercase tracking-wide text-xs">
                Image
              </span>
              <span className="truncate font-mono">
                {typeof workload.desiredState.image === "string"
                  ? workload.desiredState.image
                  : "—"}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground uppercase tracking-wide text-xs">
                Runtime
              </span>
              <span className="truncate font-mono capitalize">
                {typeof workload.desiredState.runtime === "string"
                  ? workload.desiredState.runtime
                  : "—"}
              </span>
            </div>
          )}
          {error ? (
            <p className="text-destructive flex items-start gap-1.5 text-sm">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function WorkloadResourcePlaceholderOutlet({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function ProjectBranches({
  branches,
  linkBase,
}: {
  branches: WorkspaceBranch[];
  linkBase?: {
    databaseId: string;
    organizationSlug: string;
    projectSlug: string;
  };
}) {
  if (branches.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          No branches yet. Create a database to get a default branch.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      {branches.map(({ branch, database }) => {
        const card = (
          <Card
            className={cn(linkBase !== undefined && "transition-colors hover:bg-muted/30")}
          >
            <CardHeader>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle className="truncate">{branch.name}</CardTitle>
                  <CardDescription>{database.name}</CardDescription>
                </div>
                <Badge variant="outline">{branch.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <MetadataItem label="Branch ID" value={branch.id} />
              <MetadataItem
                label="Parent"
                value={branch.parentBranchId ?? "None"}
              />
              <MetadataItem
                label="Copy mode"
                value={branchCopyModeLabel(branch.copyMode)}
              />
              <MetadataItem
                label="Expiration"
                value={branchExpirationLabel(branch.expiresAt)}
              />
              <MetadataItem
                label="Endpoint"
                value={database.endpoint?.hostname ?? "Not available"}
              />
            </CardContent>
          </Card>
        );

        return linkBase ? (
          <Link
            aria-label={`Open ${branch.name}`}
            key={branch.id}
            params={{
              ...linkBase,
              branchId: branch.id,
              view: "overview",
            }}
            to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view"
          >
            {card}
          </Link>
        ) : (
          <div key={branch.id}>{card}</div>
        );
      })}
    </div>
  );
}

interface BranchWorkspaceViewProps {
  branches: WorkspaceBranch[];
  selectedBranch: WorkspaceBranch | null;
  view: "overview" | "sql" | "tables";
}

export function BranchWorkspaceView({
  branches,
  selectedBranch,
  view,
}: BranchWorkspaceViewProps) {
  if (branches.length === 0) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          No branches yet. Create a database to get a default branch.
        </CardContent>
      </Card>
    );
  }

  if (!selectedBranch) {
    return (
      <Card>
        <CardContent className="text-muted-foreground py-6 text-sm">
          Branch not found. Use the branch menu in the header breadcrumb to
          pick another branch.
        </CardContent>
      </Card>
    );
  }

  switch (view) {
    case "overview":
      return <BranchOverview selectedBranch={selectedBranch} />;
    case "sql":
      return (
        <SqlEditor
          branchId={selectedBranch.branch.id}
          branchName={selectedBranch.branch.name}
          databaseName={selectedBranch.database.name}
        />
      );
    case "tables":
      return (
        <TablesStudio
          branchId={selectedBranch.branch.id}
          branchName={selectedBranch.branch.name}
          databaseName={selectedBranch.database.name}
        />
      );
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

function BranchOverview({
  selectedBranch,
}: {
  selectedBranch: WorkspaceBranch;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <SummaryCard
        icon={<GitBranch className="text-muted-foreground size-4" />}
        label="Branch"
        value={selectedBranch.branch.name}
      />
      <SummaryCard
        icon={<Database className="text-muted-foreground size-4" />}
        label="Database"
        value={selectedBranch.database.name}
      />
      <Card className="sm:col-span-2">
        <CardHeader>
          <CardTitle>Branch details</CardTitle>
          <CardDescription>
            Basic metadata for the selected branch.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <MetadataItem label="Status" value={selectedBranch.branch.status} />
          <MetadataItem
            label="Parent"
            value={selectedBranch.branch.parentBranchId ?? "None"}
          />
          <MetadataItem
            label="Copy mode"
            value={branchCopyModeLabel(selectedBranch.branch.copyMode)}
          />
          <MetadataItem
            label="Expiration"
            value={branchExpirationLabel(selectedBranch.branch.expiresAt)}
          />
          <MetadataItem
            label="Endpoint"
            value={
              selectedBranch.database.endpoint?.hostname ?? "Not available"
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

function SummaryCard({ icon, label, value }: SummaryCardProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          {icon}
          {label}
        </CardDescription>
        <CardTitle className="truncate text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

interface MetadataItemProps {
  label: string;
  value: string;
}

function MetadataItem({ label, value }: MetadataItemProps) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-muted/40 px-3 py-2">
      <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 truncate text-sm">{value}</p>
    </div>
  );
}

import {
  Link,
  useNavigate,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BranchCopyMode,
  BranchConnectionResponse,
  BranchExpirationTtl,
  BranchResponse,
  CreateDatabaseRequest,
  CreateWorkloadRequest,
  DatabaseResponse,
  FunctionRuntime,
  GitBranch as GitBranchResponse,
  GitProviderResponse,
  GitRepository,
  OrganizationResponse,
  PatchBranchSettingsRequest,
  PatchWorkloadConfigRequest,
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
  SidebarMenuButton,
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
  Container,
  Eye,
  EyeOff,
  GitBranch,
  Globe,
  Hash,
  LayoutDashboard,
  LogOut,
  Plus,
  RotateCcw,
  Settings,
  Table2,
  Workflow,
  X,
} from "lucide-react";
import * as React from "react";

import { authClient } from "#/auth-client";
import type { AuthUser } from "#/auth-session";
import { BranchBackupsPanel } from "#/components/branch-backups-panel";
import { HeaderUserMenu } from "#/components/header-user-menu";
import {
  HeaderStatusBadgeSkeleton,
  ProjectMainViewSkeleton,
  ProjectSwitcherLoadingLines,
  ProjectWorkspaceRouteSkeleton,
} from "#/components/loading-placeholders";
import { OrgSwitcher } from "#/components/org-switcher";
import { SqlEditor } from "#/components/sql-editor";
import { TablesStudio } from "#/components/tables-studio";
import {
  StatusDot,
  WorkloadsPanel,
  workloadKindIcon,
  workloadKindLabel,
  workloadObservedError,
  workloadObservedPublicBaseUrl,
} from "#/components/workloads-panel";
import {
  dashboardKeys,
  createBranchRequest,
  createDatabaseRequest,
  createWorkloadRequest,
  deployWorkloadRequest,
  fetchGitBranches,
  fetchGitProviders,
  fetchGitRepositories,
  fetchBranchConnection,
  fetchDatabases,
  fetchHealthOk,
  fetchOrganizations,
  fetchProjects,
  fetchWorkload,
  fetchWorkloads,
  patchBranchSettingsRequest,
  patchWorkloadConfigRequest,
  rebuildWorkloadRequest,
} from "#/lib/dashboard-api-queries";
import { parseEnvText, serializeEnvText } from "#/lib/env-text";
import {
  type ProjectWorkspaceView,
  deriveProjectWorkspaceRoute,
} from "#/lib/derive-project-workspace-route";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";
import { Route as RootRoute } from "#/routes/__root";

interface ProjectWorkspaceProps {
  children?: React.ReactNode;
  organizationSlug: string;
  projectSlug: string;
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
  onPatchBranchSettings: (
    branchId: string,
    input: PatchBranchSettingsRequest,
  ) => Promise<void>;
  organizationId: string | null;
  organizationSlug: string;
  projectId: string | null;
  projectSlug: string;
  refreshWorkloads: () => Promise<void>;
  workloads: WorkloadResponse[];
}

const ProjectOutletContext =
  React.createContext<ProjectWorkspaceOutletContext | null>(null);

export function useProjectWorkspaceOutlet(): ProjectWorkspaceOutletContext {
  const value = React.useContext(ProjectOutletContext);
  if (!value) {
    throw new Error(
      "useProjectWorkspaceOutlet must be used under ProjectWorkspace.",
    );
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
      workload.status === "requested" || workload.status === "provisioning",
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
  organizationSlug,
  projectSlug,
}: ProjectWorkspaceProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { auth } = RootRoute.useRouteContext();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  const { databaseDetailId, view, workloadDetailId } =
    deriveProjectWorkspaceRoute(pathname, organizationSlug, projectSlug);
  const focusedDatabaseId = undefined;

  const orgsQuery = useQuery({
    queryKey: dashboardKeys.organizations(),
    queryFn: fetchOrganizations,
  });

  const healthQuery = useQuery({
    queryKey: dashboardKeys.health(),
    queryFn: fetchHealthOk,
  });

  const organizations = orgsQuery.data ?? [];
  const orgId =
    orgsQuery.data?.find((o) => o.slug === organizationSlug)?.id ?? null;

  React.useEffect(() => {
    if (!orgsQuery.data || orgsQuery.isPending) return;
    const active = orgsQuery.data.find((o) => o.slug === organizationSlug);
    if (active) {
      writeStoredOrganizationId(active.id);
      return;
    }
    const fallback = pickOrganization(orgsQuery.data);
    if (!fallback) return;
    void navigate({
      to: "/$organizationSlug/projects",
      params: { organizationSlug: fallback.slug },
      replace: true,
    });
  }, [orgsQuery.data, orgsQuery.isPending, organizationSlug, navigate]);

  const projectsQuery = useQuery({
    queryKey: dashboardKeys.projects(orgId ?? ""),
    queryFn: () => fetchProjects(orgId!),
    enabled: Boolean(orgId),
  });

  const projects = projectsQuery.data ?? [];
  const project =
    projectsQuery.data?.find((p) => p.slug === projectSlug) ?? null;
  const projectId = project?.id ?? null;

  const databasesQuery = useQuery({
    queryKey: dashboardKeys.databases(projectId ?? ""),
    queryFn: () => fetchDatabases(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      const list = query.state.data;
      if (!projectId || !list) return false;
      const w = queryClient.getQueryData<WorkloadResponse[]>(
        dashboardKeys.workloads(projectId),
      );
      if (!w) return false;
      return hasActiveProvisioning(list, w) ? 2_500 : false;
    },
  });

  const workloadsQuery = useQuery({
    queryKey: dashboardKeys.workloads(projectId ?? ""),
    queryFn: () => fetchWorkloads(projectId!),
    enabled: Boolean(projectId),
    refetchInterval: (query) => {
      const list = query.state.data;
      if (!projectId || !list) return false;
      const d = queryClient.getQueryData<DatabaseResponse[]>(
        dashboardKeys.databases(projectId),
      );
      if (!d) return false;
      return hasActiveProvisioning(d, list) ? 2_500 : false;
    },
  });

  const databases = databasesQuery.data ?? [];
  const workloads = workloadsQuery.data ?? [];

  const pending =
    orgsQuery.isPending ||
    (!!orgId && projectsQuery.isPending) ||
    (!!projectId && (databasesQuery.isPending || workloadsQuery.isPending));

  const loadError = React.useMemo(() => {
    if (orgsQuery.error instanceof Error) return orgsQuery.error.message;
    if (projectsQuery.error instanceof Error)
      return projectsQuery.error.message;
    if (databasesQuery.error instanceof Error)
      return databasesQuery.error.message;
    if (workloadsQuery.error instanceof Error)
      return workloadsQuery.error.message;
    if (
      projectsQuery.data !== undefined &&
      orgId &&
      !project &&
      !projectsQuery.isPending
    ) {
      return "Project not found.";
    }
    return null;
  }, [
    orgsQuery.error,
    projectsQuery.error,
    projectsQuery.data,
    projectsQuery.isPending,
    orgId,
    project,
    databasesQuery.error,
    workloadsQuery.error,
  ]);

  const healthStatus: "error" | "loading" | "ok" | null = React.useMemo(() => {
    if (orgsQuery.isPending && !orgsQuery.data) return "loading";
    if (healthQuery.isPending) return "loading";
    return healthQuery.data ? "ok" : "error";
  }, [
    orgsQuery.isPending,
    orgsQuery.data,
    healthQuery.isPending,
    healthQuery.data,
  ]);

  const createWorkloadMut = useMutation({
    mutationFn: (input: CreateWorkloadRequest) =>
      createWorkloadRequest(projectId!, input),
    onSuccess: () => {
      if (projectId) {
        void queryClient.invalidateQueries({
          queryKey: dashboardKeys.workloads(projectId),
        });
      }
    },
  });

  const createDatabaseMut = useMutation({
    mutationFn: (input: CreateDatabaseRequest) =>
      createDatabaseRequest(projectId!, input),
    onSuccess: () => {
      if (projectId) {
        void queryClient.invalidateQueries({
          queryKey: dashboardKeys.databases(projectId),
        });
      }
    },
  });

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

  async function handleCreateWorkload(
    input: CreateWorkloadRequest,
  ): Promise<WorkloadResponse> {
    if (!projectId) {
      throw new Error("Project is not loaded yet.");
    }
    return createWorkloadMut.mutateAsync(input);
  }

  async function handleCreateDatabase(input: CreateDatabaseRequest) {
    if (!projectId) {
      throw new Error("Project is not loaded yet.");
    }
    await createDatabaseMut.mutateAsync(input);
  }

  const refreshWorkloads = React.useCallback(async (): Promise<void> => {
    if (!projectId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: dashboardKeys.workloads(projectId),
    });
  }, [projectId, queryClient]);

  const shouldHydrateWorkload =
    view === "workload-detail" &&
    Boolean(workloadDetailId) &&
    Boolean(projectId) &&
    !workloads.some((w) => w.id === workloadDetailId);

  const workloadHydrateQuery = useQuery({
    queryKey: dashboardKeys.workload(workloadDetailId ?? "_"),
    queryFn: () => fetchWorkload(workloadDetailId!),
    enabled: Boolean(shouldHydrateWorkload && workloadDetailId && !pending),
    retry: 1,
  });

  React.useEffect(() => {
    if (!workloadHydrateQuery.isSuccess || !workloadHydrateQuery.data) {
      return;
    }
    if (!projectId) return;
    const fetched = workloadHydrateQuery.data;
    if (fetched.projectId !== projectId) {
      return;
    }
    queryClient.setQueryData(
      dashboardKeys.workloads(projectId),
      (old: WorkloadResponse[] | undefined) => {
        const o = old ?? [];
        return o.some((w) => w.id === fetched.id) ? o : [...o, fetched];
      },
    );
  }, [
    workloadHydrateQuery.isSuccess,
    workloadHydrateQuery.data,
    projectId,
    queryClient,
  ]);

  const workloadDetailHydrationError = React.useMemo(() => {
    if (view !== "workload-detail" || !workloadDetailId) return null;
    if (workloadHydrateQuery.isError) {
      return workloadHydrateQuery.error instanceof Error
        ? workloadHydrateQuery.error.message
        : "Unable to load this workload.";
    }
    if (
      workloadHydrateQuery.isSuccess &&
      workloadHydrateQuery.data &&
      projectId &&
      workloadHydrateQuery.data.projectId !== projectId
    ) {
      return "This workload belongs to another project. Open it from that project's workloads list.";
    }
    return null;
  }, [
    view,
    workloadDetailId,
    workloadHydrateQuery.isError,
    workloadHydrateQuery.isSuccess,
    workloadHydrateQuery.data,
    workloadHydrateQuery.error,
    projectId,
  ]);

  const workloadDetailHydrationPending =
    shouldHydrateWorkload && workloadHydrateQuery.isFetching;

  async function handleCreateBranch(input: {
    copyMode: BranchCopyMode;
    databaseId: string;
    expirationTtl?: BranchExpirationTtl;
    name: string;
    parentBranchId?: string;
  }) {
    if (!projectId) {
      throw new Error("Project is not loaded yet.");
    }
    const branch = await createBranchRequest(input.databaseId, {
      copyMode: input.copyMode,
      expirationTtl: input.expirationTtl,
      name: input.name,
      parentBranchId: input.parentBranchId,
    });

    queryClient.setQueryData(
      dashboardKeys.databases(projectId),
      (old: DatabaseResponse[] | undefined) => {
        if (!old) return old;
        return old.map((database) =>
          database.id === input.databaseId
            ? { ...database, branches: [...database.branches, branch] }
            : database,
        );
      },
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

  async function handlePatchBranchSettings(
    branchId: string,
    input: PatchBranchSettingsRequest,
  ) {
    if (!projectId) {
      throw new Error("Project is not loaded yet.");
    }

    const branch = await patchBranchSettingsRequest(branchId, input);

    queryClient.setQueryData(
      dashboardKeys.databases(projectId),
      (old: DatabaseResponse[] | undefined) => {
        if (!old) return old;
        return old.map((database) => ({
          ...database,
          branches: database.branches.map((row) =>
            row.id === branch.id ? branch : row,
          ),
        }));
      },
    );

    queryClient.removeQueries({
      queryKey: dashboardKeys.branchConnection(branch.id),
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  const selectedOrganizationId = orgId;
  const branches = flattenBranches(databases);

  const selectedBranch = databaseDetailId
    ? (branches.filter((item) => item.database.id === databaseDetailId)[0] ??
      null)
    : focusedDatabaseId
      ? (branches.filter((item) => item.database.id === focusedDatabaseId)[0] ??
        null)
      : null;

  const workspaceOutletContext: ProjectWorkspaceOutletContext = {
    branches,
    databases,
    onCreateBranch: handleCreateBranch,
    onPatchBranchSettings: handlePatchBranchSettings,
    organizationId: orgId,
    organizationSlug,
    projectId,
    projectSlug,
    refreshWorkloads,
    workloads,
  };

  return (
    <ProjectOutletContext.Provider value={workspaceOutletContext}>
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
        user={auth.user}
        view={view}
        workloadDetailHydrationError={workloadDetailHydrationError}
        workloadDetailHydrationPending={workloadDetailHydrationPending}
        workloadDetailId={workloadDetailId}
        workloads={workloads}
      >
        {view === "database-detail" || view === "workload-detail" ? (
          children
        ) : (
          <>
            <ProjectWorkspaceContent
              branches={branches}
              databases={databases}
              errorMessage={loadError}
              loading={pending}
              onCreateBranch={handleCreateBranch}
              onCreateDatabase={handleCreateDatabase}
              onCreateWorkload={handleCreateWorkload}
              organizationSlug={organizationSlug}
              project={project}
              projectSlug={projectSlug}
              selectedBranch={selectedBranch}
              view={view}
              workloads={workloads}
              focusedDatabaseId={focusedDatabaseId}
            />
            {children}
          </>
        )}
      </ProjectWorkspaceShell>
    </ProjectOutletContext.Provider>
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
  user: AuthUser | null;
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
  user,
  view,
  workloadDetailHydrationError,
  workloadDetailHydrationPending,
  workloadDetailId,
  workloads,
}: ProjectWorkspaceShellProps) {
  const dedicatedResourceInset =
    view === "database-detail" || view === "workload-detail";

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-16 min-w-0 items-center justify-between gap-4 border-border border-b px-3">
        <div className="flex min-w-0 items-center gap-2">
          <OrgSwitcher
            disabled={pending && organizations.length === 0}
            onSelectOrganization={onSelectOrganization}
            organizations={organizations}
            pending={pending}
            selectedOrganizationId={selectedOrganizationId}
          />
          <span className="shrink-0 text-muted-foreground text-sm">/</span>
          <ProjectSwitcher
            disabled={pending || projects.length === 0}
            onSelectProject={onSelectProject}
            pending={pending}
            project={project}
            projects={projects}
          />
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {healthStatus === "loading" ? <HeaderStatusBadgeSkeleton /> : null}
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
          <HeaderUserMenu onSignOut={onSignOut} user={user} />
        </div>
      </header>

      <div className="grid h-[calc(100dvh-4rem)] min-h-0 md:grid-cols-[280px_1fr]">
        <ProjectSidebar
          databases={databases}
          onSignOut={onSignOut}
          organizationSlug={organizationSlug}
          project={project}
          projectSlug={projectSlug}
          view={view}
          workloads={workloads}
        />
        <SidebarInset className="flex min-h-0 flex-col">
          {dedicatedResourceInset ? (
            <WorkspaceDedicatedResourceInset
              branches={branches}
              databaseDetailId={databaseDetailId}
              databases={databases}
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
    return <ProjectWorkspaceRouteSkeleton />;
  }

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
      <div className="w-full min-w-0 px-4 py-4 md:px-5 md:py-5">
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
    );
  }

  if (
    view === "workload-detail" &&
    workloadDetailId !== undefined &&
    detailWorkload === null
  ) {
    return (
      <div className="w-full min-w-0 px-4 py-4 md:px-5 md:py-5">
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
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {tabBarParams ? (
        <div className="border-border border-b px-4 pt-4 md:px-5 md:pt-5">
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
          "flex w-full min-w-0 flex-col gap-6 px-4 py-4 md:px-5 md:py-5",
          tabBarParams !== null && "min-h-0 flex-1",
          studioFullBleed &&
            "max-w-none overflow-hidden gap-2 px-2 pb-4 pt-2 md:px-3",
        )}
      >
        {tabBarParams !== null ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        ) : (
          children
        )}
      </div>
    </div>
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
  const effectiveBranchId = studioBranchId ?? dbBranches[0]?.branch.id ?? null;

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
  const isTablesActive = studioBranchId !== null && studioViewRaw === "tables";
  const isSettingsActive =
    studioBranchId !== null && studioViewRaw === "settings";
  const isBackupsActive =
    studioBranchId !== null && studioViewRaw === "backups";

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
        to="/$organizationSlug/projects/$projectSlug/databases/$databaseId"
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
      {studioParams ? (
        <InsetTabLink
          active={isBackupsActive}
          label="Backups"
          params={{ ...studioParams, view: "backups" }}
          to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view"
        />
      ) : (
        <InsetTabMuted label="Backups" />
      )}
      {studioParams ? (
        <InsetTabLink
          active={isSettingsActive}
          label="Settings"
          params={{ ...studioParams, view: "settings" }}
          to="/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view"
        />
      ) : (
        <InsetTabMuted label="Settings" />
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

  let studioNavigateView:
    | "backups"
    | "overview"
    | "settings"
    | "sql"
    | "tables" = "overview";
  let urlBranchId: string | null = null;

  if (branchStudioTail.length > 0) {
    const segments = branchStudioTail.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const [id, rawView] = segments;
      if (
        typeof id === "string" &&
        (rawView === "backups" ||
          rawView === "overview" ||
          rawView === "settings" ||
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
                      urlBranchId !== null ? studioNavigateView : "overview",
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
        to="/$organizationSlug/projects/$projectSlug/workloads/$workloadId"
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
      preload="intent"
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
  pending?: boolean;
  project: ProjectResponse | null;
  projects: ProjectResponse[];
}

function ProjectSwitcher({
  disabled,
  onSelectProject,
  pending = false,
  project,
  projects,
}: ProjectSwitcherProps) {
  const showProjectSkeleton = pending && projects.length === 0;

  return (
    <SidebarMenu className="inline-block max-w-xs min-w-0">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <SidebarMenuButton
              className="w-full min-w-0"
              size="lg"
              type="button"
            >
              <Boxes className="size-4 shrink-0" data-slot="project-icon" />
              {showProjectSkeleton ? (
                <ProjectSwitcherLoadingLines />
              ) : (
                <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {project?.name ?? "Project"}
                  </span>
                </div>
              )}
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
            </SidebarMenuButton>
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
      </SidebarMenuItem>
    </SidebarMenu>
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
      preload="intent"
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
  onCreateDatabase: (input: CreateDatabaseRequest) => Promise<void>;
  onCreateWorkload: (input: CreateWorkloadRequest) => Promise<WorkloadResponse>;
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
        : "Every cluster is Postgres with branching environments. Open one to connect, browse tables, or run SQL.";
    case "workloads":
      return "Containers and functions in this project—they run beside your Postgres and use the same network context.";
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
  onCreateDatabase,
  onCreateWorkload,
  organizationSlug,
  project,
  projectSlug,
  selectedBranch,
  view,
  workloads,
}: ProjectWorkspaceContentProps) {
  return (
    <div className="flex min-w-0 flex-col gap-6 px-4 py-4 md:px-5 md:py-5">
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
        <ProjectMainViewSkeleton />
      ) : project ? (
        <>
          {view === "dashboard" ? (
            <ProjectOverview
              databases={databases}
              onCreateDatabase={onCreateDatabase}
              organizationSlug={organizationSlug}
              projectSlug={projectSlug}
              workloads={workloads}
            />
          ) : view === "services" ? (
            <ServicesPanel
              databases={databases}
              onCreateDatabase={onCreateDatabase}
              organizationSlug={organizationSlug}
              projectSlug={projectSlug}
              workloads={workloads}
            />
          ) : view === "databases" ? (
            <DatabasesPanel
              databases={databases}
              focusedDatabaseId={focusedDatabaseId}
              onCreateDatabase={onCreateDatabase}
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

function ServicesEmptyState({
  databases,
  onCreateDatabase,
  organizationSlug,
  projectSlug,
}: {
  databases: DatabaseResponse[];
  onCreateDatabase: (input: CreateDatabaseRequest) => Promise<void>;
  organizationSlug: string;
  projectSlug: string;
}) {
  return (
    <Card className="border-dashed bg-muted/15">
      <CardContent className="flex flex-col items-center gap-8 px-4 py-12 text-center sm:px-8 sm:py-14">
        <div className="flex flex-col items-center gap-4">
          <div className="flex size-14 items-center justify-center rounded-full border border-dashed border-border bg-background">
            <Boxes className="text-muted-foreground size-7" />
          </div>
          <div className="max-w-md">
            <h3 className="font-semibold text-xl tracking-tight">
              No services yet
            </h3>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <CreateDatabaseModal
            existingNames={databases.map((d) => d.name)}
            onCreateDatabase={onCreateDatabase}
            triggerLabel="Create database"
          />
          <Link
            className={cn(
              buttonVariants({ size: "default", variant: "outline" }),
              "gap-2",
            )}
            params={{ organizationSlug, projectSlug }}
            preload="intent"
            to="/$organizationSlug/projects/$projectSlug/workloads"
          >
            <Workflow className="size-4 shrink-0" />
            Add workload
          </Link>
        </div>

        <div className="flex w-full max-w-xl flex-col gap-3 pt-2 sm:flex-row">
          <Link
            className={cn(
              "flex flex-1 flex-col gap-2 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            params={{ organizationSlug, projectSlug }}
            preload="intent"
            search={{}}
            to="/$organizationSlug/projects/$projectSlug/databases"
          >
            <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
              <Database className="text-muted-foreground size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-sm leading-none">
                Postgres & branching
              </p>
              <p className="text-muted-foreground text-xs leading-snug">
                Clusters and branches, SQL studio.
              </p>
            </div>
          </Link>
          <Link
            className={cn(
              "flex flex-1 flex-col gap-2 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted/40",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
            params={{ organizationSlug, projectSlug }}
            preload="intent"
            to="/$organizationSlug/projects/$projectSlug/workloads"
          >
            <div className="flex size-10 items-center justify-center rounded-md border border-border bg-muted">
              <Workflow className="text-muted-foreground size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-sm leading-none">
                Containers & functions
              </p>
              <p className="text-muted-foreground text-xs leading-snug">
                Containers and serverless beside Postgres.
              </p>
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

interface ProjectOverviewProps {
  databases: DatabaseResponse[];
  onCreateDatabase: (input: CreateDatabaseRequest) => Promise<void>;
  organizationSlug: string;
  projectSlug: string;
  workloads: WorkloadResponse[];
}

function ProjectOverview({
  databases,
  onCreateDatabase,
  organizationSlug,
  projectSlug,
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
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-semibold text-lg tracking-tight">Services</h2>
          {services.length > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <CreateDatabaseModal
                existingNames={databases.map((d) => d.name)}
                onCreateDatabase={onCreateDatabase}
              />
              <Link
                className="text-muted-foreground text-sm hover:text-foreground"
                params={{ organizationSlug, projectSlug }}
                preload="intent"
                to="/$organizationSlug/projects/$projectSlug/services"
              >
                View all →
              </Link>
            </div>
          ) : null}
        </div>
        {services.length === 0 ? (
          <ServicesEmptyState
            databases={databases}
            onCreateDatabase={onCreateDatabase}
            organizationSlug={organizationSlug}
            projectSlug={projectSlug}
          />
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
  onCreateDatabase: (input: CreateDatabaseRequest) => Promise<void>;
  organizationSlug: string;
  projectSlug: string;
  workloads: WorkloadResponse[];
}

function ServicesPanel({
  databases,
  onCreateDatabase,
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
      <ServicesEmptyState
        databases={databases}
        onCreateDatabase={onCreateDatabase}
        organizationSlug={organizationSlug}
        projectSlug={projectSlug}
      />
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        <CreateDatabaseModal
          existingNames={databases.map((d) => d.name)}
          onCreateDatabase={onCreateDatabase}
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

function ResourceCardKeyRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
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
      preload="intent"
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
      preload="intent"
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
              workload.kind === "container"
                ? "Image"
                : workload.kind === "function"
                  ? "Runtime"
                  : "Setup"
            }
            value={
              workload.kind === "container"
                ? typeof workload.desiredState.image === "string"
                  ? workload.desiredState.image
                  : "—"
                : workload.kind === "function"
                  ? typeof workload.desiredState.runtime === "string"
                    ? workload.desiredState.runtime
                    : "—"
                  : "Not configured"
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
  onCreateDatabase,
  organizationSlug,
  projectSlug,
}: {
  databases: DatabaseResponse[];
  focusedDatabaseId?: string;
  onCreateDatabase: (input: CreateDatabaseRequest) => Promise<void>;
  organizationSlug: string;
  projectSlug: string;
}) {
  const existingNames = databases.map((d) => d.name);

  return (
    <div className="grid gap-4">
      {databases.length > 0 ? (
        <div className="flex justify-end">
          <CreateDatabaseModal
            existingNames={existingNames}
            onCreateDatabase={onCreateDatabase}
          />
        </div>
      ) : null}

      {databases.length === 0 ? (
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
            <CreateDatabaseModal
              existingNames={existingNames}
              onCreateDatabase={onCreateDatabase}
              triggerLabel="Create your first database"
            />
          </CardContent>
        </Card>
      ) : (
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
              preload="intent"
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
      )}
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
    .slice(-12)
    .toLowerCase();
  const hostname = isLocalEndpoint ? "postgres" : endpoint.hostname;
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
  const queryClient = useQueryClient();
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
  const [copyingConnection, setCopyingConnection] = React.useState<
    "internal" | "public" | null
  >(null);
  const [copiedConnection, setCopiedConnection] = React.useState<
    "internal" | "public" | null
  >(null);
  const modalBranch =
    branches.find((item) => item.branch.id === modalBranchId) ??
    selectedBranch ??
    null;
  const maskedInternalConnectionString =
    connection?.maskedInternalConnectionString ??
    buildMaskedConnectionString(modalBranch);
  const internalConnectionString = revealed
    ? (connection?.internalConnectionString ?? maskedInternalConnectionString)
    : maskedInternalConnectionString;
  const publicConnectionString =
    connection?.internetAccessEnabled === true
      ? revealed
        ? connection.publicConnectionString
        : connection.maskedPublicConnectionString
      : null;

  React.useEffect(() => {
    setModalBranchId(selectedBranch?.branch.id ?? "");
  }, [selectedBranch?.branch.id]);

  React.useEffect(() => {
    setConnection(null);
    setConnectionError(null);
    setRevealed(false);
    setRevealing(false);
    setCopyingConnection(null);
    setCopiedConnection(null);
    setShowConnection(false);
  }, [modalBranchId]);

  async function loadConnectionDetails() {
    if (!modalBranch) return null;
    if (connection) return connection;

    setRevealing(true);
    setConnectionError(null);

    try {
      const nextConnection = await queryClient.fetchQuery({
        queryKey: dashboardKeys.branchConnection(modalBranch.branch.id),
        queryFn: () => fetchBranchConnection(modalBranch.branch.id),
      });
      setConnection(nextConnection);
      return nextConnection;
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : "Failed to load connection string",
      );
      return null;
    } finally {
      setRevealing(false);
    }
  }

  async function loadConnectionString(kind: "internal" | "public") {
    const nextConnection = await loadConnectionDetails();
    if (!nextConnection) return null;

    return kind === "public"
      ? nextConnection.publicConnectionString
      : nextConnection.internalConnectionString;
  }

  async function handleShowConnection() {
    setShowConnection(true);
    await loadConnectionDetails();
  }

  async function handleToggleReveal() {
    if (!modalBranch) return;

    if (revealed) {
      setRevealed(false);
      return;
    }

    const nextConnection = await loadConnectionDetails();
    if (!nextConnection) return;

    setRevealed(true);
  }

  async function handleCopyConnection(kind: "internal" | "public") {
    if (!modalBranch) return;

    setCopyingConnection(kind);
    setCopiedConnection(null);
    setConnectionError(null);

    try {
      const nextConnectionString = await loadConnectionString(kind);
      if (!nextConnectionString) return;

      await navigator.clipboard.writeText(nextConnectionString);
      setRevealed(true);
      setCopiedConnection(kind);
      window.setTimeout(() => setCopiedConnection(null), 1500);
    } catch (err) {
      setConnectionError(
        err instanceof Error ? err.message : "Failed to copy connection string",
      );
    } finally {
      setCopyingConnection(null);
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 text-left backdrop-blur-sm"
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
                  onClick={() => void handleShowConnection()}
                  type="button"
                  variant="secondary"
                >
                  View connection string
                </Button>
              ) : (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Internal connection string
                    </p>
                    <code className="block overflow-x-auto rounded-lg border border-border bg-background p-3 text-sm">
                      {internalConnectionString}
                    </code>
                  </div>
                  {publicConnectionString ? (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        Public connection string
                      </p>
                      <code className="block overflow-x-auto rounded-lg border border-border bg-background p-3 text-sm">
                        {publicConnectionString}
                      </code>
                    </div>
                  ) : connection?.internetAccessEnabled ? (
                    <p className="text-muted-foreground text-sm">
                      Internet access is enabled, but no public database
                      hostname is configured yet.
                    </p>
                  ) : null}
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      aria-label={revealed ? "Hide password" : "Show password"}
                      disabled={
                        !modalBranch || revealing || copyingConnection !== null
                      }
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
                      aria-label="Copy internal connection string"
                      disabled={
                        !modalBranch || revealing || copyingConnection !== null
                      }
                      onClick={() => void handleCopyConnection("internal")}
                      size="sm"
                      title="Copy internal connection string"
                      type="button"
                      variant="outline"
                    >
                      {copiedConnection === "internal" ? (
                        <Check className="size-4" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      Internal
                    </Button>
                    {publicConnectionString ? (
                      <Button
                        aria-label="Copy public connection string"
                        disabled={
                          !modalBranch ||
                          revealing ||
                          copyingConnection !== null
                        }
                        onClick={() => void handleCopyConnection("public")}
                        size="sm"
                        title="Copy public connection string"
                        type="button"
                        variant="outline"
                      >
                        {copiedConnection === "public" ? (
                          <Check className="size-4" />
                        ) : (
                          <Copy className="size-4" />
                        )}
                        Public
                      </Button>
                    ) : null}
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

function CreateDatabaseModal({
  existingNames,
  onCreateDatabase,
  triggerLabel = "New database",
}: {
  existingNames: string[];
  onCreateDatabase: (input: CreateDatabaseRequest) => Promise<void>;
  triggerLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [postgresVersion, setPostgresVersion] = React.useState("18");
  const [submitting, setSubmitting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  function closeModal() {
    if (submitting) return;
    setOpen(false);
    setName("");
    setPostgresVersion("18");
    setErrorMessage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedVersion = postgresVersion.trim();

    if (!trimmedName) {
      setErrorMessage("Database name is required.");
      return;
    }

    if (trimmedName.length > 63) {
      setErrorMessage("Database name must be at most 63 characters.");
      return;
    }

    if (existingNames.includes(trimmedName)) {
      setErrorMessage("A database with this name already exists.");
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      await onCreateDatabase({
        name: trimmedName,
        postgresVersion: trimmedVersion || "18",
      });
      setOpen(false);
      setName("");
      setPostgresVersion("18");
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to create database",
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
            className="w-full max-w-lg rounded-xl border border-border bg-card text-card-foreground shadow-lg"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <div className="flex items-start justify-between gap-4 border-border border-b p-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  Create database
                </h2>
                <p className="text-muted-foreground text-sm">
                  Provision a Postgres cluster in this project. You can add more
                  clusters anytime.
                </p>
              </div>
              <Button
                aria-label="Close create database modal"
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
                <label className="text-sm font-medium" htmlFor="database-name">
                  Cluster name
                </label>
                <Input
                  autoFocus
                  id="database-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="analytics"
                  value={name}
                />
              </div>

              <div className="space-y-2">
                <label
                  className="text-sm font-medium"
                  htmlFor="database-postgres-version"
                >
                  Postgres major version
                </label>
                <Input
                  id="database-postgres-version"
                  onChange={(event) => setPostgresVersion(event.target.value)}
                  placeholder="18"
                  value={postgresVersion}
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
                {submitting ? "Creating…" : "Create database"}
              </Button>
            </div>
          </form>
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
  const databaseBranches = branches.filter(
    (row) => row.database.id === databaseId,
  );
  const studioBranchAnchor = databaseBranches[0] ?? null;

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
          <ConnectButton
            branches={databaseBranches}
            selectedBranch={studioBranchAnchor}
          />
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
            <Card
              key={branch.id}
              className="h-full rounded-xl shadow-none transition-colors hover:bg-muted/30"
            >
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
                    preload="intent"
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
                    preload="intent"
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
  const { organizationId, projectId, workloads, refreshWorkloads } =
    useProjectWorkspaceOutlet();
  const queryClient = useQueryClient();
  const workload = workloads.find((item) => item.id === workloadId) ?? null;
  const initialKind =
    workload?.kind === "function" || workload?.kind === "container"
      ? workload.kind
      : "container";
  const [kind, setKind] = React.useState<"container" | "function">(initialKind);
  const [containerSource, setContainerSource] = React.useState<
    "image" | "gitProvider" | "git"
  >("image");
  const [functionSource, setFunctionSource] = React.useState<
    "image" | "bundle" | "gitProvider" | "git"
  >("gitProvider");
  const [image, setImage] = React.useState("");
  const [portsText, setPortsText] = React.useState("");
  const [runtime, setRuntime] = React.useState<FunctionRuntime>("bun");
  const [entrypoint, setEntrypoint] = React.useState("index.ts");
  const [artifactUri, setArtifactUri] = React.useState("");
  const [dockerfilePath, setDockerfilePath] = React.useState("Dockerfile");
  const [contextPath, setContextPath] = React.useState(".");
  const [genericRepositoryUrl, setGenericRepositoryUrl] = React.useState("");
  const [gitProviderId, setGitProviderId] = React.useState("");
  const [repositoryFullName, setRepositoryFullName] = React.useState("");
  const [repositoryId, setRepositoryId] = React.useState<
    string | number | undefined
  >();
  const [repositoryUrl, setRepositoryUrl] = React.useState("");
  const [gitRef, setGitRef] = React.useState("");
  const [gitPath, setGitPath] = React.useState("");
  const [envText, setEnvText] = React.useState("");
  const [autoDeploy, setAutoDeploy] = React.useState(true);
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!workload) return;
    const nextDesired = workload.desiredState;
    if (workload.kind === "container" || workload.kind === "function") {
      setKind(workload.kind);
    }
    const build = readRecord(nextDesired.build);
    const source = readRecord(build.source);
    const fnSource = readRecord(nextDesired.source);
    const imageValue =
      typeof nextDesired.image === "string"
        ? nextDesired.image
        : typeof fnSource.image === "string"
          ? fnSource.image
          : "";
    setImage(imageValue);
    setPortsText(readNumberArray(nextDesired.ports).join(", "));
    setRuntime(nextDesired.runtime === "node" ? "node" : "bun");
    setEntrypoint(
      typeof nextDesired.entrypoint === "string"
        ? nextDesired.entrypoint
        : "index.ts",
    );
    setArtifactUri(
      typeof fnSource.artifactUri === "string" ? fnSource.artifactUri : "",
    );
    setDockerfilePath(
      typeof build.dockerfilePath === "string"
        ? build.dockerfilePath
        : "Dockerfile",
    );
    setContextPath(
      typeof build.contextUri === "string" ? build.contextUri : ".",
    );
    const providerSource =
      source.type === "gitProvider"
        ? source
        : fnSource.type === "gitProvider"
          ? fnSource
          : {};
    setGitProviderId(
      typeof providerSource.gitProviderId === "string"
        ? providerSource.gitProviderId
        : "",
    );
    setRepositoryFullName(
      typeof providerSource.repositoryFullName === "string"
        ? providerSource.repositoryFullName
        : "",
    );
    setRepositoryId(
      typeof providerSource.repositoryId === "string" ||
        typeof providerSource.repositoryId === "number"
        ? providerSource.repositoryId
        : undefined,
    );
    setRepositoryUrl(
      typeof providerSource.repositoryUrl === "string"
        ? providerSource.repositoryUrl
        : "",
    );
    setGitRef(
      typeof source.ref === "string"
        ? source.ref
        : typeof fnSource.ref === "string"
          ? fnSource.ref
          : "",
    );
    setGitPath(
      typeof source.path === "string"
        ? source.path
        : typeof fnSource.path === "string"
          ? fnSource.path
          : "",
    );
    const genericSource =
      source.type === "git" ? source : fnSource.type === "git" ? fnSource : {};
    setGenericRepositoryUrl(
      typeof genericSource.repositoryUrl === "string"
        ? genericSource.repositoryUrl
        : "",
    );
    setContainerSource(
      typeof nextDesired.image === "string"
        ? "image"
        : source.type === "git"
          ? "git"
          : source.type === "gitProvider"
            ? "gitProvider"
            : "image",
    );
    setFunctionSource(
      fnSource.type === "image"
        ? "image"
        : fnSource.type === "bundle"
          ? "bundle"
          : fnSource.type === "git"
            ? "git"
            : "gitProvider",
    );
    setAutoDeploy(nextDesired.autoDeploy !== false);
    setEnvText(formatEnvText(readStringRecord(nextDesired.env)));
  }, [workload]);

  const providersQuery = useQuery({
    enabled: Boolean(organizationId),
    queryKey: organizationId
      ? dashboardKeys.gitProviders(organizationId)
      : dashboardKeys.gitProviders("_"),
    queryFn: () => fetchGitProviders(organizationId!),
  });

  const selectedProvider =
    providersQuery.data?.find((provider) => provider.id === gitProviderId) ??
    null;

  const repositoriesQuery = useQuery({
    enabled: Boolean(selectedProvider),
    queryKey: selectedProvider
      ? dashboardKeys.gitRepositories(
          selectedProvider.providerType,
          selectedProvider.id,
        )
      : dashboardKeys.gitRepositories("github", "_"),
    queryFn: () =>
      fetchGitRepositories(
        selectedProvider!.providerType,
        selectedProvider!.id,
      ),
  });

  const branchesQuery = useQuery({
    enabled: Boolean(selectedProvider && repositoryFullName),
    queryKey: selectedProvider
      ? dashboardKeys.gitBranches(
          selectedProvider.providerType,
          selectedProvider.id,
          repositoryFullName || "_",
        )
      : dashboardKeys.gitBranches("github", "_", "_"),
    queryFn: () =>
      fetchGitBranches({
        gitProviderId: selectedProvider!.id,
        providerType: selectedProvider!.providerType,
        repositoryFullName,
        repositoryId,
      }),
  });

  const configMut = useMutation({
    mutationFn: (input: PatchWorkloadConfigRequest) =>
      patchWorkloadConfigRequest(workloadId, input),
    onSuccess: (updated) => {
      if (projectId) {
        queryClient.setQueryData(
          dashboardKeys.workloads(projectId),
          (old: WorkloadResponse[] | undefined) =>
            old?.map((item) => (item.id === updated.id ? updated : item)) ??
            old,
        );
      }
      void refreshWorkloads();
    },
  });
  const deployMut = useMutation({
    mutationFn: () => deployWorkloadRequest(workloadId),
    onSuccess: () => {
      void refreshWorkloads();
    },
  });
  const rebuildMut = useMutation({
    mutationFn: () => rebuildWorkloadRequest(workloadId),
    onSuccess: () => {
      void refreshWorkloads();
    },
  });

  const busyProvisioning =
    workload?.status === "provisioning" || workload?.status === "requested";

  function buildConfigPayload(): PatchWorkloadConfigRequest {
    const env = parseOptionalEnv(envText);
    if (kind === "container") {
      const ports = parseOptionalPorts(portsText);
      if (containerSource === "image") {
        if (!image.trim()) {
          throw new Error("Docker image is required.");
        }
        return {
          autoDeploy,
          env,
          image: image.trim(),
          kind: "container",
          ports,
        };
      }

      return {
        build: {
          contextUri: contextPath.trim() || ".",
          dockerfilePath: dockerfilePath.trim() || "Dockerfile",
          source: buildGitSource({
            genericRepositoryUrl,
            gitPath,
            gitProviderId,
            gitRef,
            repositoryFullName,
            repositoryId,
            repositoryUrl,
            selectedProvider,
            sourceType: containerSource,
          }),
        },
        autoDeploy,
        env,
        kind: "container",
        ports,
      };
    }

    const base = {
      autoDeploy,
      entrypoint: entrypoint.trim() || "index.ts",
      env,
      kind: "function" as const,
      runtime,
    };

    if (functionSource === "image") {
      if (!image.trim()) {
        throw new Error("Function image is required.");
      }
      return {
        ...base,
        source: { image: image.trim(), type: "image" },
      };
    }

    if (functionSource === "bundle") {
      if (!artifactUri.trim()) {
        throw new Error("Bundle artifact URI is required.");
      }
      return {
        ...base,
        source: { artifactUri: artifactUri.trim(), type: "bundle" },
      };
    }

    return {
      ...base,
      build: {
        contextUri: contextPath.trim() || ".",
        dockerfilePath: dockerfilePath.trim() || "Dockerfile",
      },
      source: buildGitSource({
        genericRepositoryUrl,
        gitPath,
        gitProviderId,
        gitRef,
        repositoryFullName,
        repositoryId,
        repositoryUrl,
        selectedProvider,
        sourceType: functionSource,
      }),
    };
  }

  async function saveConfig(): Promise<void> {
    setFormError(null);
    try {
      await configMut.mutateAsync(buildConfigPayload());
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Configuration could not be saved.",
      );
      throw error;
    }
  }

  async function deploy() {
    try {
      await saveConfig();
      await deployMut.mutateAsync();
    } catch {
      /* error surfaced via formError / deployMut */
    }
  }

  async function rebuild() {
    if (workload === null) return;
    try {
      await rebuildMut.mutateAsync();
    } catch {
      /* error surfaced via rebuildMut */
    }
  }

  const rebuildErrorMessage =
    formError ??
    (deployMut.error instanceof Error
      ? deployMut.error.message
      : deployMut.isError
        ? "Deploy could not be started"
        : rebuildMut.error instanceof Error
          ? rebuildMut.error.message
          : rebuildMut.isError
            ? "Rebuild could not be started"
            : null);

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
  const isConfigured =
    workload.kind === "container" || workload.kind === "function";
  const isSaving = configMut.isPending || deployMut.isPending;
  const publicUrl = workloadObservedPublicBaseUrl(workload);
  const sourceSummary = workloadSourceSummary(workload);
  const activeSource = kind === "container" ? containerSource : functionSource;

  return (
    <div className="grid gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-border border-b bg-muted/20">
          <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
                <Icon className="text-muted-foreground size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <CardTitle className="truncate text-2xl">
                    {workload.name}
                  </CardTitle>
                  <StatusDot status={workload.status} />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                aria-busy={deployMut.isPending}
                className="gap-1.5"
                disabled={isSaving || busyProvisioning}
                onClick={() => void deploy()}
                type="button"
              >
                <Workflow
                  className={cn(
                    "size-4",
                    deployMut.isPending && "animate-pulse",
                  )}
                  aria-hidden
                />
                Deploy Now
              </Button>
              <Button
                aria-busy={rebuildMut.isPending}
                className="gap-1.5"
                disabled={
                  rebuildMut.isPending ||
                  busyProvisioning ||
                  !isConfigured ||
                  workload.status === "draft"
                }
                onClick={() => void rebuild()}
                type="button"
                variant="outline"
              >
                <RotateCcw
                  className={cn(
                    "size-4",
                    rebuildMut.isPending && "animate-spin",
                  )}
                  aria-hidden
                />
                Rebuild
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <WorkloadFact label="Type" value={workloadKindLabel(workload.kind)} />
          <WorkloadFact label="Source" value={sourceSummary} />
          <WorkloadFact
            label={workload.kind === "function" ? "Runtime" : "Ports"}
            value={
              workload.kind === "function"
                ? typeof workload.desiredState.runtime === "string"
                  ? workload.desiredState.runtime
                  : "Not set"
                : readNumberArray(workload.desiredState.ports).join(", ") ||
                  "Not set"
            }
          />
          <WorkloadFact
            label="Endpoint"
            value={publicUrl ?? "Not deployed"}
            valueClassName={publicUrl ? "normal-case" : undefined}
          />
          {error ? (
            <p className="text-destructive flex items-start gap-1.5 text-sm sm:col-span-2 lg:col-span-4">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
          {rebuildErrorMessage !== null ? (
            <p
              className="text-destructive text-sm sm:col-span-2 lg:col-span-4"
              role="alert"
            >
              {rebuildErrorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-5">
          <Card>
            <CardHeader className="pb-3">
              <SectionEyebrow>General</SectionEyebrow>
              <CardTitle>Type</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                active={kind === "container"}
                icon={<Container className="size-4" />}
                label="Container"
                onClick={() => setKind("container")}
              />
              <ChoiceCard
                active={kind === "function"}
                icon={<Workflow className="size-4" />}
                label="Function"
                onClick={() => setKind("function")}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <SectionEyebrow>Source</SectionEyebrow>
              <CardTitle>Provider</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              {kind === "container" ? (
                <SourceModeTabs
                  options={[
                    {
                      icon: <Container className="size-4" />,
                      label: "Docker Image",
                      value: "image",
                    },
                    {
                      icon: <GitBranch className="size-4" />,
                      label: "Git Provider",
                      value: "gitProvider",
                    },
                    {
                      icon: <Code2 className="size-4" />,
                      label: "Git URL",
                      value: "git",
                    },
                  ]}
                  value={containerSource}
                  onChange={(value) =>
                    setContainerSource(value as "image" | "gitProvider" | "git")
                  }
                />
              ) : (
                <SourceModeTabs
                  options={[
                    {
                      icon: <GitBranch className="size-4" />,
                      label: "Git Provider",
                      value: "gitProvider",
                    },
                    {
                      icon: <Code2 className="size-4" />,
                      label: "Git URL",
                      value: "git",
                    },
                    {
                      icon: <Container className="size-4" />,
                      label: "Image",
                      value: "image",
                    },
                    {
                      icon: <Boxes className="size-4" />,
                      label: "Bundle",
                      value: "bundle",
                    },
                  ]}
                  value={functionSource}
                  onChange={(value) =>
                    setFunctionSource(
                      value as "image" | "bundle" | "gitProvider" | "git",
                    )
                  }
                />
              )}

              {kind === "container" ? (
                <>
                  {containerSource === "image" ? (
                    <TextField
                      label="Docker image"
                      onChange={setImage}
                      placeholder="ghcr.io/acme/api:latest"
                      value={image}
                    />
                  ) : (
                    <GitSourceFields
                      branches={branchesQuery.data ?? []}
                      contextPath={contextPath}
                      dockerfilePath={dockerfilePath}
                      genericRepositoryUrl={genericRepositoryUrl}
                      gitPath={gitPath}
                      gitProviderId={gitProviderId}
                      gitRef={gitRef}
                      loadingBranches={branchesQuery.isFetching}
                      loadingProviders={providersQuery.isFetching}
                      loadingRepositories={repositoriesQuery.isFetching}
                      onContextPathChange={setContextPath}
                      onDockerfilePathChange={setDockerfilePath}
                      onGenericRepositoryUrlChange={setGenericRepositoryUrl}
                      onGitPathChange={setGitPath}
                      onGitProviderChange={(next) => {
                        setGitProviderId(next);
                        setRepositoryFullName("");
                        setRepositoryId(undefined);
                        setRepositoryUrl("");
                        setGitRef("");
                      }}
                      onGitRefChange={setGitRef}
                      onRepositoryChange={(repo) => {
                        setRepositoryFullName(repo.fullName);
                        setRepositoryId(repo.id);
                        setRepositoryUrl(repo.url ?? "");
                        setGitRef(repo.defaultBranch ?? "");
                      }}
                      providers={providersQuery.data ?? []}
                      repositories={repositoriesQuery.data ?? []}
                      repositoryFullName={repositoryFullName}
                      sourceType={
                        containerSource === "git" ? "git" : "gitProvider"
                      }
                    />
                  )}
                </>
              ) : (
                <>
                  {functionSource === "image" ? (
                    <TextField
                      label="Function image"
                      onChange={setImage}
                      placeholder="ghcr.io/acme/function:latest"
                      value={image}
                    />
                  ) : functionSource === "bundle" ? (
                    <TextField
                      label="Artifact URI"
                      onChange={setArtifactUri}
                      placeholder="s3://bucket/function.zip"
                      value={artifactUri}
                    />
                  ) : (
                    <GitSourceFields
                      branches={branchesQuery.data ?? []}
                      contextPath={contextPath}
                      dockerfilePath={dockerfilePath}
                      genericRepositoryUrl={genericRepositoryUrl}
                      gitPath={gitPath}
                      gitProviderId={gitProviderId}
                      gitRef={gitRef}
                      loadingBranches={branchesQuery.isFetching}
                      loadingProviders={providersQuery.isFetching}
                      loadingRepositories={repositoriesQuery.isFetching}
                      onContextPathChange={setContextPath}
                      onDockerfilePathChange={setDockerfilePath}
                      onGenericRepositoryUrlChange={setGenericRepositoryUrl}
                      onGitPathChange={setGitPath}
                      onGitProviderChange={(next) => {
                        setGitProviderId(next);
                        setRepositoryFullName("");
                        setRepositoryId(undefined);
                        setRepositoryUrl("");
                        setGitRef("");
                      }}
                      onGitRefChange={setGitRef}
                      onRepositoryChange={(repo) => {
                        setRepositoryFullName(repo.fullName);
                        setRepositoryId(repo.id);
                        setRepositoryUrl(repo.url ?? "");
                        setGitRef(repo.defaultBranch ?? "");
                      }}
                      providers={providersQuery.data ?? []}
                      repositories={repositoriesQuery.data ?? []}
                      repositoryFullName={repositoryFullName}
                      sourceType={
                        functionSource === "git" ? "git" : "gitProvider"
                      }
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <SectionEyebrow>
                {kind === "function" ? "Runtime" : "Networking"}
              </SectionEyebrow>
              <CardTitle>
                {kind === "function" ? "Function runtime" : "Ports"}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              {kind === "function" ? (
                <>
                  <SelectField
                    label="Runtime"
                    onChange={(value) => setRuntime(value as FunctionRuntime)}
                    options={[
                      ["bun", "Bun"],
                      ["node", "Node"],
                    ]}
                    value={runtime}
                  />
                  <TextField
                    label="Entrypoint"
                    onChange={setEntrypoint}
                    placeholder="index.ts"
                    value={entrypoint}
                  />
                </>
              ) : (
                <TextField
                  label="Ports"
                  onChange={setPortsText}
                  placeholder="3000, 8080"
                  value={portsText}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <SectionEyebrow>Environment</SectionEyebrow>
              <CardTitle>Variables</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                className={cn(
                  "min-h-36 w-full rounded-md border border-border bg-background p-3 font-mono text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
                id="workload-env"
                onChange={(event) => setEnvText(event.target.value)}
                placeholder="KEY=value"
                value={envText}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit xl:sticky xl:top-20">
          <CardHeader className="pb-3">
            <SectionEyebrow>Deploy</SectionEyebrow>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <WorkloadFact label="Type" value={kind} />
              <WorkloadFact
                label="Source"
                value={sourceModeLabel(activeSource)}
              />
              <WorkloadFact
                label="Status"
                value={busyProvisioning ? "Provisioning" : workload.status}
              />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
              <span>Auto deploy on push</span>
              <input
                checked={autoDeploy}
                className="size-4 accent-primary"
                onChange={(event) => setAutoDeploy(event.target.checked)}
                type="checkbox"
              />
            </label>
            <Button
              className="w-full"
              disabled={isSaving || busyProvisioning}
              onClick={() => void deploy()}
              type="button"
            >
              {deployMut.isPending ? "Deploying..." : "Deploy Now"}
            </Button>
            <Button
              className="w-full"
              disabled={configMut.isPending || busyProvisioning}
              onClick={() => void saveConfig()}
              type="button"
              variant="outline"
            >
              {configMut.isPending ? "Saving..." : "Save configuration"}
            </Button>
            {rebuildErrorMessage !== null ? (
              <p className="text-destructive text-sm" role="alert">
                {rebuildErrorMessage}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNumberArray(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item))
    : [];
}

function readStringRecord(value: unknown): Record<string, string> {
  const record = readRecord(value);
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function formatEnvText(env: Record<string, string>): string {
  return serializeEnvText(env);
}

function sourceModeLabel(value: string): string {
  switch (value) {
    case "image":
      return "Docker image";
    case "gitProvider":
      return "Git provider";
    case "git":
      return "Git URL";
    case "bundle":
      return "Bundle";
    default:
      return value;
  }
}

function workloadSourceSummary(workload: WorkloadResponse): string {
  const desired = workload.desiredState;
  const build = readRecord(desired.build);
  const buildSource = readRecord(build.source);
  const functionSource = readRecord(desired.source);

  if (typeof desired.image === "string" && desired.image.trim().length > 0) {
    return desired.image;
  }

  if (
    functionSource.type === "image" &&
    typeof functionSource.image === "string"
  ) {
    return functionSource.image;
  }

  const providerSource =
    buildSource.type === "gitProvider"
      ? buildSource
      : functionSource.type === "gitProvider"
        ? functionSource
        : null;
  if (
    providerSource !== null &&
    typeof providerSource.repositoryFullName === "string"
  ) {
    return providerSource.repositoryFullName;
  }

  const gitSource =
    buildSource.type === "git"
      ? buildSource
      : functionSource.type === "git"
        ? functionSource
        : null;
  if (gitSource !== null && typeof gitSource.repositoryUrl === "string") {
    return gitSource.repositoryUrl;
  }

  if (
    functionSource.type === "bundle" &&
    typeof functionSource.artifactUri === "string"
  ) {
    return "Bundle artifact";
  }

  return "Not configured";
}

function parseOptionalEnv(text: string): Record<string, string> | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const parsed = parseEnvText(text);
  return Object.keys(parsed).length > 0 ? parsed : undefined;
}

function parseOptionalPorts(text: string): number[] | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const ports = trimmed.split(/[,\s]+/u).map((token) => {
    const port = Number(token);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${token}`);
    }
    return port;
  });
  return ports.length > 0 ? ports : undefined;
}

function buildGitSource(input: {
  genericRepositoryUrl: string;
  gitPath: string;
  gitProviderId: string;
  gitRef: string;
  repositoryFullName: string;
  repositoryId?: string | number;
  repositoryUrl: string;
  selectedProvider: GitProviderResponse | null;
  sourceType: "gitProvider" | "git" | "image" | "bundle";
}) {
  const path = input.gitPath.trim() || undefined;
  const ref = input.gitRef.trim() || undefined;

  if (input.sourceType === "git") {
    const repositoryUrl = input.genericRepositoryUrl.trim();
    if (!repositoryUrl) {
      throw new Error("Repository URL is required.");
    }
    return {
      path,
      ref,
      repositoryUrl,
      type: "git" as const,
    };
  }

  if (input.sourceType !== "gitProvider") {
    throw new Error("Git provider source is required.");
  }

  if (!input.selectedProvider || !input.gitProviderId) {
    throw new Error("Choose a connected Git provider.");
  }

  if (!input.repositoryFullName) {
    throw new Error("Choose a repository.");
  }

  return {
    gitProviderId: input.gitProviderId,
    path,
    providerType: input.selectedProvider.providerType,
    ref,
    repositoryFullName: input.repositoryFullName,
    repositoryId: input.repositoryId,
    repositoryUrl: input.repositoryUrl || undefined,
    type: "gitProvider" as const,
  };
}

function ChoiceCard({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "flex flex-col items-start gap-1 rounded-md border p-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/5"
          : "border-border bg-background hover:bg-accent/50",
      )}
      onClick={onClick}
      type="button"
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </div>
    </button>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
      {children}
    </p>
  );
}

function WorkloadFact({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </p>
      <p
        className={cn("truncate font-mono text-sm capitalize", valueClassName)}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function SourceModeTabs({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: Array<{
    icon: React.ReactNode;
    label: string;
    value: string;
  }>;
  value: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors",
            value === option.value
              ? "border-primary bg-primary/5 text-foreground"
              : "border-border bg-background hover:bg-muted/50",
          )}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.icon}
          <span className="font-medium">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  const id = React.useId();
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <Input
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  const id = React.useId();
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <select
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </div>
  );
}

function GitSourceFields({
  branches,
  contextPath,
  dockerfilePath,
  genericRepositoryUrl,
  gitPath,
  gitProviderId,
  gitRef,
  loadingBranches,
  loadingProviders,
  loadingRepositories,
  onContextPathChange,
  onDockerfilePathChange,
  onGenericRepositoryUrlChange,
  onGitPathChange,
  onGitProviderChange,
  onGitRefChange,
  onRepositoryChange,
  providers,
  repositories,
  repositoryFullName,
  sourceType,
}: {
  branches: GitBranchResponse[];
  contextPath: string;
  dockerfilePath: string;
  genericRepositoryUrl: string;
  gitPath: string;
  gitProviderId: string;
  gitRef: string;
  loadingBranches: boolean;
  loadingProviders: boolean;
  loadingRepositories: boolean;
  onContextPathChange: (value: string) => void;
  onDockerfilePathChange: (value: string) => void;
  onGenericRepositoryUrlChange: (value: string) => void;
  onGitPathChange: (value: string) => void;
  onGitProviderChange: (value: string) => void;
  onGitRefChange: (value: string) => void;
  onRepositoryChange: (repository: GitRepository) => void;
  providers: GitProviderResponse[];
  repositories: GitRepository[];
  repositoryFullName: string;
  sourceType: "gitProvider" | "git";
}) {
  if (sourceType === "git") {
    return (
      <div className="grid gap-4 rounded-md border border-border bg-muted/20 p-3">
        <TextField
          label="Repository URL"
          onChange={onGenericRepositoryUrlChange}
          placeholder="https://github.com/acme/api"
          value={genericRepositoryUrl}
        />
        <GitPathAndRefFields
          branches={[]}
          gitPath={gitPath}
          gitRef={gitRef}
          loadingBranches={false}
          onGitPathChange={onGitPathChange}
          onGitRefChange={onGitRefChange}
        />
        <DockerfileFields
          contextPath={contextPath}
          dockerfilePath={dockerfilePath}
          onContextPathChange={onContextPathChange}
          onDockerfilePathChange={onDockerfilePathChange}
        />
      </div>
    );
  }

  return (
    <div className="grid gap-4 rounded-md border border-border bg-muted/20 p-3">
      <SelectField
        label="Git provider"
        onChange={onGitProviderChange}
        options={[
          ["", loadingProviders ? "Loading providers..." : "Choose provider"],
          ...providers.map(
            (provider) =>
              [provider.id, `${provider.name} (${provider.providerType})`] as [
                string,
                string,
              ],
          ),
        ]}
        value={gitProviderId}
      />
      <SelectField
        label="Repository"
        onChange={(next) => {
          const repo = repositories.find((item) => item.fullName === next);
          if (repo) onRepositoryChange(repo);
        }}
        options={[
          [
            "",
            loadingRepositories
              ? "Loading repositories..."
              : "Choose repository",
          ],
          ...repositories.map(
            (repository) =>
              [repository.fullName, repository.fullName] as [string, string],
          ),
        ]}
        value={repositoryFullName}
      />
      <GitPathAndRefFields
        branches={branches}
        gitPath={gitPath}
        gitRef={gitRef}
        loadingBranches={loadingBranches}
        onGitPathChange={onGitPathChange}
        onGitRefChange={onGitRefChange}
      />
      <DockerfileFields
        contextPath={contextPath}
        dockerfilePath={dockerfilePath}
        onContextPathChange={onContextPathChange}
        onDockerfilePathChange={onDockerfilePathChange}
      />
    </div>
  );
}

function GitPathAndRefFields({
  branches,
  gitPath,
  gitRef,
  loadingBranches,
  onGitPathChange,
  onGitRefChange,
}: {
  branches: GitBranchResponse[];
  gitPath: string;
  gitRef: string;
  loadingBranches: boolean;
  onGitPathChange: (value: string) => void;
  onGitRefChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {branches.length > 0 ? (
        <SelectField
          label="Branch / ref"
          onChange={onGitRefChange}
          options={[
            ["", loadingBranches ? "Loading branches..." : "Default branch"],
            ...branches.map(
              (branch) => [branch.name, branch.name] as [string, string],
            ),
          ]}
          value={gitRef}
        />
      ) : (
        <TextField
          label="Branch / ref"
          onChange={onGitRefChange}
          placeholder="main"
          value={gitRef}
        />
      )}
      <TextField
        label="Path"
        onChange={onGitPathChange}
        placeholder="apps/api"
        value={gitPath}
      />
    </div>
  );
}

function DockerfileFields({
  contextPath,
  dockerfilePath,
  onContextPathChange,
  onDockerfilePathChange,
}: {
  contextPath: string;
  dockerfilePath: string;
  onContextPathChange: (value: string) => void;
  onDockerfilePathChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        label="Dockerfile"
        onChange={onDockerfilePathChange}
        placeholder="Dockerfile"
        value={dockerfilePath}
      />
      <TextField
        label="Build context"
        onChange={onContextPathChange}
        placeholder="."
        value={contextPath}
      />
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
            className={cn(
              linkBase !== undefined && "transition-colors hover:bg-muted/30",
            )}
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
            preload="intent"
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
  view: "backups" | "overview" | "settings" | "sql" | "tables";
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
          Branch not found. Use the branch menu in the header breadcrumb to pick
          another branch.
        </CardContent>
      </Card>
    );
  }

  switch (view) {
    case "overview":
      return (
        <BranchOverview branches={branches} selectedBranch={selectedBranch} />
      );
    case "settings":
      return <BranchSettings selectedBranch={selectedBranch} />;
    case "backups":
      return <BranchBackupsView selectedBranch={selectedBranch} />;
    case "sql":
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SqlEditor
            branchId={selectedBranch.branch.id}
            branchName={selectedBranch.branch.name}
            databaseName={selectedBranch.database.name}
          />
        </div>
      );
    case "tables":
      return (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <TablesStudio
            branchId={selectedBranch.branch.id}
            branchName={selectedBranch.branch.name}
            databaseName={selectedBranch.database.name}
          />
        </div>
      );
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

function BranchBackupsView({
  selectedBranch,
}: {
  selectedBranch: WorkspaceBranch;
}) {
  const { organizationSlug } = useProjectWorkspaceOutlet();
  return (
    <BranchBackupsPanel
      branchId={selectedBranch.branch.id}
      branchName={selectedBranch.branch.name}
      branches={selectedBranch.database.branches}
      databaseId={selectedBranch.database.id}
      organizationSlug={organizationSlug}
    />
  );
}

function BranchSettings({
  selectedBranch,
}: {
  selectedBranch: WorkspaceBranch;
}) {
  const { onPatchBranchSettings } = useProjectWorkspaceOutlet();
  const [internetAccessEnabled, setInternetAccessEnabled] = React.useState(
    selectedBranch.branch.internetAccessEnabled,
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const settingsChanged =
    internetAccessEnabled !== selectedBranch.branch.internetAccessEnabled;

  React.useEffect(() => {
    setInternetAccessEnabled(selectedBranch.branch.internetAccessEnabled);
    setErrorMessage(null);
  }, [selectedBranch.branch.id, selectedBranch.branch.internetAccessEnabled]);

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      onPatchBranchSettings(selectedBranch.branch.id, {
        internetAccessEnabled,
      }),
    onError: (err) => {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to save branch settings",
      );
    },
    onSuccess: () => {
      setErrorMessage(null);
    },
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="text-muted-foreground size-4" />
            Branch settings
          </CardTitle>
          <CardDescription>
            Configure how clients can reach this branch.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-4">
            <input
              checked={internetAccessEnabled}
              className="mt-1"
              disabled={saveSettingsMutation.isPending}
              onChange={(event) =>
                setInternetAccessEnabled(event.currentTarget.checked)
              }
              type="checkbox"
            />
            <span className="grid gap-1">
              <span className="flex items-center gap-2 font-medium text-sm">
                <Globe className="text-muted-foreground size-4" />
                Expose this branch to the internet
              </span>
              <span className="text-muted-foreground text-sm">
                When enabled, the Connect modal shows both internal and public
                connection strings for this branch.
              </span>
            </span>
          </label>

          {errorMessage ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <div className="flex justify-end">
            <Button
              disabled={!settingsChanged || saveSettingsMutation.isPending}
              onClick={() => saveSettingsMutation.mutate()}
              type="button"
            >
              {saveSettingsMutation.isPending ? "Saving..." : "Save settings"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function BranchOverview({
  branches,
  selectedBranch,
}: {
  branches: WorkspaceBranch[];
  selectedBranch: WorkspaceBranch;
}) {
  const databaseBranches = branches.filter(
    (row) => row.database.id === selectedBranch.database.id,
  );

  return (
    <div className="grid gap-4">
      <ConnectButton
        branches={databaseBranches}
        selectedBranch={selectedBranch}
      />

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

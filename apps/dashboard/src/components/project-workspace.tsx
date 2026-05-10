import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import type {
  BranchCopyMode,
  BranchConnectionResponse,
  BranchExpirationTtl,
  BranchResponse,
  DatabaseResponse,
  OrganizationResponse,
  ProjectResponse,
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
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
} from "@openbika/ui/components/sidebar";
import { cn } from "@openbika/ui/lib/utils";
import {
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
  Table2,
  X,
} from "lucide-react";
import * as React from "react";

import { authClient } from "#/auth-client";
import { OrgSwitcher } from "#/components/org-switcher";
import { SqlEditor } from "#/components/sql-editor";
import { TablesStudio } from "#/components/tables-studio";
import { getDashboardApiClient } from "#/lib/openbika-client";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";

type ProjectWorkspaceView =
  | "branches"
  | "dashboard"
  | "overview"
  | "sql"
  | "tables";

interface ProjectWorkspaceProps {
  branchId?: string;
  organizationSlug: string;
  projectSlug: string;
  view: ProjectWorkspaceView;
}

interface WorkspaceBranch {
  branch: BranchResponse;
  database: DatabaseResponse;
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

function hasActiveProvisioning(databases: DatabaseResponse[]) {
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
      return "Dashboard";
    case "overview":
      return "Branch overview";
    case "sql":
      return "SQL editor";
    case "tables":
      return "Tables";
    default: {
      const exhaustive: never = view;
      return exhaustive;
    }
  }
}

export function ProjectWorkspace({
  branchId,
  organizationSlug,
  projectSlug,
  view,
}: ProjectWorkspaceProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = React.useState<
    OrganizationResponse[]
  >([]);
  const [projects, setProjects] = React.useState<ProjectResponse[]>([]);
  const [project, setProject] = React.useState<ProjectResponse | null>(null);
  const [databases, setDatabases] = React.useState<DatabaseResponse[]>([]);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(true);
  const [healthStatus, setHealthStatus] = React.useState<
    "error" | "loading" | "ok" | null
  >(null);

  const selectedOrganizationId =
    organizations.find((o) => o.slug === organizationSlug)?.id ?? null;
  const branches = flattenBranches(databases);
  const selectedBranch = branchId
    ? (branches.find((item) => item.branch.id === branchId) ?? null)
    : (branches[0] ?? null);
  const shouldPollProvisioning = project
    ? hasActiveProvisioning(databases)
    : false;

  React.useEffect(() => {
    let cancelled = false;
    const client = getDashboardApiClient();

    async function load() {
      setPending(true);
      setLoadError(null);
      setProject(null);
      setDatabases([]);
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

        const databaseList = await client.listDatabases(activeProject.id);
        if (cancelled) return;

        setProject(activeProject);
        setDatabases(databaseList);
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load project",
        );
        setProject(null);
        setDatabases([]);
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

    let cancelled = false;
    const client = getDashboardApiClient();

    async function refreshProvisioningStatus() {
      try {
        const databaseList = await client.listDatabases(project.id);
        if (!cancelled) {
          setDatabases(databaseList);
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

  function handleSelectBranch(nextBranchId: string) {
    void navigate({
      to: "/$organizationSlug/projects/$projectSlug/branches/$branchId/$view",
      params: {
        branchId: nextBranchId,
        organizationSlug,
        projectSlug,
        view: view === "dashboard" || view === "branches" ? "overview" : view,
      },
    });
  }

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
      to: "/$organizationSlug/projects/$projectSlug/branches/$branchId/$view",
      params: {
        branchId: branch.id,
        organizationSlug,
        projectSlug,
        view: "overview",
      },
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  return (
    <ProjectWorkspaceShell
      branchId={selectedBranch?.branch.id}
      branches={branches}
      databases={databases}
      healthStatus={healthStatus}
      onSelectBranch={handleSelectBranch}
      onSelectOrganization={handleSelectOrganization}
      onSelectProject={handleSelectProject}
      onSignOut={handleSignOut}
      organizations={organizations}
      organizationSlug={organizationSlug}
      pending={pending}
      project={project}
      projects={projects}
      projectSlug={projectSlug}
      selectedBranch={selectedBranch}
      selectedOrganizationId={selectedOrganizationId}
      view={view}
    >
      <ProjectWorkspaceContent
        branches={branches}
        databases={databases}
        errorMessage={loadError}
        loading={pending}
        onCreateBranch={handleCreateBranch}
        project={project}
        selectedBranch={selectedBranch}
        view={view}
      />
    </ProjectWorkspaceShell>
  );
}

interface ProjectWorkspaceShellProps {
  branchId?: string;
  branches: WorkspaceBranch[];
  children: React.ReactNode;
  databases: DatabaseResponse[];
  healthStatus: "error" | "loading" | "ok" | null;
  onSelectBranch: (branchId: string) => void;
  onSelectOrganization: (organizationId: string) => void;
  onSelectProject: (projectSlug: string) => void;
  onSignOut: () => void;
  organizations: OrganizationResponse[];
  organizationSlug: string;
  pending: boolean;
  project: ProjectResponse | null;
  projects: ProjectResponse[];
  projectSlug: string;
  selectedBranch: WorkspaceBranch | null;
  selectedOrganizationId: string | null;
  view: ProjectWorkspaceView;
}

function ProjectWorkspaceShell({
  branchId,
  branches,
  children,
  databases,
  healthStatus,
  onSelectBranch,
  onSelectOrganization,
  onSelectProject,
  onSignOut,
  organizations,
  organizationSlug,
  pending,
  project,
  projects,
  projectSlug,
  selectedBranch,
  selectedOrganizationId,
  view,
}: ProjectWorkspaceShellProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="grid h-16 border-border border-b md:grid-cols-[280px_1fr]">
        <div className="flex min-w-0 items-center gap-2 border-border p-3 md:border-r">
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

        <div className="hidden items-center justify-end gap-2 px-4 md:flex lg:px-8">
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

      <div className="grid min-h-[calc(100dvh-4rem)] md:grid-cols-[280px_1fr]">
        <ProjectSidebar
          branchId={branchId}
          branches={branches}
          databases={databases}
          onSelectBranch={onSelectBranch}
          onSignOut={onSignOut}
          organizationSlug={organizationSlug}
          project={project}
          projectSlug={projectSlug}
          selectedBranch={selectedBranch}
          view={view}
        />
        <SidebarInset>{children}</SidebarInset>
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
  branchId?: string;
  branches: WorkspaceBranch[];
  databases: DatabaseResponse[];
  onSelectBranch: (branchId: string) => void;
  onSignOut: () => void;
  organizationSlug: string;
  project: ProjectResponse | null;
  projectSlug: string;
  selectedBranch: WorkspaceBranch | null;
  view: ProjectWorkspaceView;
}

function ProjectSidebar({
  branchId,
  branches,
  databases,
  onSelectBranch,
  onSignOut,
  organizationSlug,
  project,
  projectSlug,
  selectedBranch,
  view,
}: ProjectSidebarProps) {
  return (
    <Sidebar className="min-h-0">
      <SidebarContent>
        <SidebarGroup className="space-y-3">
          <div className="px-2">
            <p className="truncate font-medium">{project?.name ?? "Project"}</p>
            <p className="text-muted-foreground text-xs">
              {pluralize(databases.length, "database")} ·{" "}
              {pluralize(branches.length, "branch", "branches")}
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
                Dashboard
              </WorkspaceNavLink>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <WorkspaceNavLink
                active={view === "branches"}
                params={{ organizationSlug, projectSlug }}
                to="/$organizationSlug/projects/$projectSlug/branches"
              >
                <GitBranch className="size-4" />
                Branches
              </WorkspaceNavLink>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="mt-6 space-y-3">
          <SidebarGroupLabel>Branch</SidebarGroupLabel>
          <BranchSelector
            branches={branches}
            onSelectBranch={onSelectBranch}
            selectedBranch={selectedBranch}
          />

          <SidebarMenu>
            <SidebarMenuItem>
              <BranchNavLink
                active={view === "overview"}
                branchId={branchId}
                icon={<GitBranch className="size-4" />}
                label="Overview"
                organizationSlug={organizationSlug}
                projectSlug={projectSlug}
                view="overview"
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <BranchNavLink
                active={view === "sql"}
                branchId={branchId}
                icon={<Code2 className="size-4" />}
                label="SQL Editor"
                organizationSlug={organizationSlug}
                projectSlug={projectSlug}
                view="sql"
              />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <BranchNavLink
                active={view === "tables"}
                branchId={branchId}
                icon={<Table2 className="size-4" />}
                label="Tables"
                organizationSlug={organizationSlug}
                projectSlug={projectSlug}
                view="tables"
              />
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

interface BranchSelectorProps {
  branches: WorkspaceBranch[];
  onSelectBranch: (branchId: string) => void;
  selectedBranch: WorkspaceBranch | null;
}

function BranchSelector({
  branches,
  onSelectBranch,
  selectedBranch,
}: BranchSelectorProps) {
  return (
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
          {selectedBranch?.branch.name ?? "No branches"}
        </span>
        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          Branches
        </DropdownMenuLabel>
        {branches.map(({ branch, database }) => (
          <DropdownMenuItem
            className="gap-2 p-2"
            key={branch.id}
            onClick={() => onSelectBranch(branch.id)}
          >
            <GitBranch className="size-4 opacity-70" />
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{branch.name}</span>
              <span className="truncate text-muted-foreground text-xs">
                {database.name} · {branch.status}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface WorkspaceNavLinkProps {
  active: boolean;
  children: React.ReactNode;
  params: Record<string, string>;
  to: string;
}

function WorkspaceNavLink({
  active,
  children,
  params,
  to,
}: WorkspaceNavLinkProps) {
  return (
    <Link
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        active && "bg-sidebar-accent text-sidebar-accent-foreground",
      )}
      params={params}
      to={to}
    >
      {children}
    </Link>
  );
}

interface BranchNavLinkProps {
  active: boolean;
  branchId?: string;
  icon: React.ReactNode;
  label: string;
  organizationSlug: string;
  projectSlug: string;
  view: Exclude<ProjectWorkspaceView, "branches" | "dashboard">;
}

function BranchNavLink({
  active,
  branchId,
  icon,
  label,
  organizationSlug,
  projectSlug,
  view,
}: BranchNavLinkProps) {
  if (!branchId) {
    return (
      <span className="flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground opacity-50">
        {icon}
        {label}
      </span>
    );
  }

  return (
    <WorkspaceNavLink
      active={active}
      params={{ branchId, organizationSlug, projectSlug, view }}
      to="/$organizationSlug/projects/$projectSlug/branches/$branchId/$view"
    >
      {icon}
      {label}
    </WorkspaceNavLink>
  );
}

interface ProjectWorkspaceContentProps {
  branches: WorkspaceBranch[];
  databases: DatabaseResponse[];
  errorMessage: string | null;
  loading: boolean;
  onCreateBranch: (input: {
    copyMode: BranchCopyMode;
    databaseId: string;
    expirationTtl?: BranchExpirationTtl;
    name: string;
    parentBranchId?: string;
  }) => Promise<void>;
  project: ProjectResponse | null;
  selectedBranch: WorkspaceBranch | null;
  view: ProjectWorkspaceView;
}

function ProjectWorkspaceContent({
  branches,
  databases,
  errorMessage,
  loading,
  onCreateBranch,
  project,
  selectedBranch,
  view,
}: ProjectWorkspaceContentProps) {
  const isStudioView = view === "sql" || view === "tables";

  return (
    <div
      className={cn(
        "flex flex-col",
        isStudioView
          ? "h-[calc(100dvh-4rem)] min-h-0 overflow-hidden gap-3 p-3"
          : "mx-auto max-w-7xl gap-6 p-4 lg:p-8",
      )}
    >
      {!isStudioView ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {viewLabel(view)}
            </h1>
            <p className="text-muted-foreground text-sm">
              {view === "dashboard"
                ? `Project details for ${project?.name ?? "this project"}.`
                : view === "branches"
                  ? "Manage project branches across databases."
                  : `${selectedBranch?.branch.name ?? "Branch"} in ${selectedBranch?.database.name ?? "database"}.`}
            </p>
          </div>
          {project ? (
            <div className="flex flex-wrap items-center gap-2">
              {view === "branches" ? (
                <CreateBranchModal
                  databases={databases}
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
      ) : null}

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
          {!isStudioView ? (
            <ProvisioningStatusCard databases={databases} />
          ) : null}
          {view === "dashboard" ? (
            <ProjectDashboard
              branches={branches}
              databases={databases}
              project={project}
              selectedBranch={selectedBranch}
            />
          ) : view === "branches" ? (
            <ProjectBranches branches={branches} />
          ) : (
            <BranchWorkspaceView
              branches={branches}
              selectedBranch={selectedBranch}
              view={view}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

function ProvisioningStatusCard({
  databases,
}: {
  databases: DatabaseResponse[];
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

  if (trackedDatabases.length === 0) {
    return null;
  }

  const hasActiveWork = hasActiveProvisioning(trackedDatabases);

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
      </CardContent>
    </Card>
  );
}

interface ProjectDashboardProps {
  branches: WorkspaceBranch[];
  databases: DatabaseResponse[];
  project: ProjectResponse;
  selectedBranch: WorkspaceBranch | null;
}

function ProjectDashboard({
  branches,
  databases,
  project,
  selectedBranch,
}: ProjectDashboardProps) {
  const branchCount = countBranches(databases);

  return (
    <>
      <ConnectButton branches={branches} selectedBranch={selectedBranch} />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={<Database className="text-muted-foreground size-4" />}
          label="Databases"
          value={databases.length.toString()}
        />
        <SummaryCard
          icon={<GitBranch className="text-muted-foreground size-4" />}
          label="Branches"
          value={branchCount.toString()}
        />
        <SummaryCard
          icon={<Hash className="text-muted-foreground size-4" />}
          label="Project slug"
          value={project.slug}
        />
      </div>

      <div className="grid gap-4">
        {databases.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground py-6 text-sm">
              No databases yet. Create one to start adding branches.
            </CardContent>
          </Card>
        ) : (
          databases.map((database) => (
            <Card key={database.id}>
              <CardHeader>
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="truncate">{database.name}</CardTitle>
                    <CardDescription>
                      PostgreSQL {database.postgresVersion}
                    </CardDescription>
                  </div>
                  <Badge variant="outline">{database.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                <MetadataItem label="Plan" value={database.plan} />
                <MetadataItem
                  label="Endpoint"
                  value={database.endpoint?.hostname ?? "Not available"}
                />
              </CardContent>
              <CardFooter className="flex-wrap justify-start gap-2">
                <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
                  <GitBranch className="size-3.5" />
                  {pluralize(database.branches.length, "branch", "branches")}
                </span>
                {database.branches.map((branch) => (
                  <Badge key={branch.id} variant="outline">
                    {branch.name}
                  </Badge>
                ))}
              </CardFooter>
            </Card>
          ))
        )}
      </div>
    </>
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

function ProjectBranches({ branches }: { branches: WorkspaceBranch[] }) {
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
      {branches.map(({ branch, database }) => (
        <Card key={branch.id}>
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
      ))}
    </div>
  );
}

interface BranchWorkspaceViewProps {
  branches: WorkspaceBranch[];
  selectedBranch: WorkspaceBranch | null;
  view: Exclude<ProjectWorkspaceView, "branches" | "dashboard">;
}

function BranchWorkspaceView({
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
          Branch not found. Select another branch from the sidebar.
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

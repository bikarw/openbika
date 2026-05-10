import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import type { OrganizationResponse, ProjectResponse } from "@openbika/contracts";
import * as React from "react";

import { authClient } from "#/auth-client";
import { DashboardShell } from "#/components/dashboard-shell";
import { OrgSwitcher } from "#/components/org-switcher";
import { ProjectsPanel } from "#/components/projects-panel";
import { getDashboardApiClient } from "#/lib/openbika-client";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";

export const Route = createFileRoute("/_protected/$organizationSlug/projects/")(
  {
    component: ProjectsRoutePage,
  },
);

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

function buildProjectSlug(name: string, projects: ProjectResponse[]) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-{2,}/g, "-")
      .slice(0, 63) || "project";
  const normalized = base.length >= 2 ? base : `${base}-project`;
  const existingSlugs = new Set(projects.map((project) => project.slug));

  if (!existingSlugs.has(normalized)) {
    return normalized;
  }

  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${normalized.slice(0, 63 - suffix.length)}${suffix}`;
    if (!existingSlugs.has(candidate)) {
      return candidate;
    }
  }

  return `${normalized.slice(0, 55)}-${Date.now().toString(36)}`;
}

function ProjectsRoutePage() {
  const { organizationSlug } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();

  const [organizations, setOrganizations] = React.useState<
    OrganizationResponse[]
  >([]);
  const [projects, setProjects] = React.useState<ProjectResponse[]>([]);
  const [projectBranchCounts, setProjectBranchCounts] = React.useState<
    Record<string, number>
  >({});
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(true);
  const [healthStatus, setHealthStatus] = React.useState<
    "error" | "loading" | "ok" | null
  >(null);

  const selectedOrganizationId =
    organizations.find((o) => o.slug === organizationSlug)?.id ?? null;

  React.useEffect(() => {
    let cancelled = false;
    const client = getDashboardApiClient();

    async function load() {
      setPending(true);
      setLoadError(null);
      setProjectBranchCounts({});
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
          setProjects([]);
          setProjectBranchCounts({});

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

        const [projList, healthy] = await Promise.all([
          client.listProjects({ organizationId: active.id }),
          healthPromise,
        ]);
        if (cancelled) return;

        const branchCountEntries = await Promise.all(
          projList.map(async (project) => {
            const databases = await client.listDatabases(project.id);
            const branchCount = databases.reduce(
              (total, database) => total + database.branches.length,
              0,
            );

            return [project.id, branchCount] as const;
          }),
        );
        if (cancelled) return;

        setOrganizations(orgs);
        setProjects(projList);
        setProjectBranchCounts(Object.fromEntries(branchCountEntries));
        setHealthStatus(healthy ? "ok" : "error");
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load dashboard data",
        );
        setProjects([]);
        setProjectBranchCounts({});
        setHealthStatus("error");
      } finally {
        if (!cancelled) setPending(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [navigate, organizationSlug]);

  function handleSelectOrganization(organizationId: string) {
    const organization = organizations.find((org) => org.id === organizationId);
    if (!organization) return;

    writeStoredOrganizationId(organization.id);
    void navigate({
      to: "/$organizationSlug/projects",
      params: { organizationSlug: organization.slug },
    });
  }

  async function handleCreateProject(input: { name: string }) {
    if (!selectedOrganizationId) {
      throw new Error("Select an organization before creating a project.");
    }

    const client = getDashboardApiClient();
    const slug = buildProjectSlug(input.name, projects);
    const project = await client.createProject({
      name: input.name,
      organizationId: selectedOrganizationId,
      slug,
    });

    await client.createDatabase(project.id, {
      name: slug,
    });

    await navigate({
      to: "/$organizationSlug/projects/$projectSlug",
      params: { organizationSlug, projectSlug: project.slug },
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  return (
    <DashboardShell
      headerStatus={healthStatus}
      onSignOut={handleSignOut}
      orgSwitcher={
        <OrgSwitcher
          disabled={pending && organizations.length === 0}
          onSelectOrganization={handleSelectOrganization}
          organizations={organizations}
          pending={pending}
          selectedOrganizationId={selectedOrganizationId}
        />
      }
    >
      <ProjectsPanel
        branchCountsByProjectId={projectBranchCounts}
        errorMessage={loadError}
        loading={pending}
        organizations={organizations}
        projects={projects}
        onCreateProject={handleCreateProject}
        selectedOrganizationId={selectedOrganizationId}
      />
    </DashboardShell>
  );
}

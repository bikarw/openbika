import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  OrganizationResponse,
  ProjectSummaryResponse,
} from "@openbika/contracts";
import * as React from "react";

import { authClient } from "#/auth-client";
import { DashboardShell } from "#/components/dashboard-shell";
import { OrgSwitcher } from "#/components/org-switcher";
import { ProjectsPanel } from "#/components/projects-panel";
import {
  createProjectRequest,
  dashboardKeys,
  fetchHealthOk,
  fetchOrganizations,
  fetchProjectSummaries,
} from "#/lib/dashboard-api-queries";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";
import { Route as RootRoute } from "#/routes/__root";

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

function ProjectsRoutePage() {
  const { organizationSlug } = Route.useParams();
  const { auth } = RootRoute.useRouteContext();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: dashboardKeys.organizations(),
    queryFn: fetchOrganizations,
  });

  const organizations = orgsQuery.data ?? [];
  const orgId =
    organizations.find((o) => o.slug === organizationSlug)?.id ?? null;

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

  const healthQuery = useQuery({
    queryKey: dashboardKeys.health(),
    queryFn: fetchHealthOk,
  });

  const summariesQuery = useQuery({
    queryKey: dashboardKeys.projectSummaries(orgId ?? ""),
    queryFn: () => fetchProjectSummaries(orgId!),
    enabled: Boolean(orgId),
    refetchInterval: (query) => {
      const list = query.state.data as ProjectSummaryResponse[] | undefined;
      if (!list) return false;
      const hasProvisioning = list.some(
        (summary) =>
          summary.organizationId === orgId && summary.isProvisioning,
      );
      return hasProvisioning ? 3_000 : false;
    },
  });

  const summaries = summariesQuery.data ?? [];
  const selectedOrganizationId = orgId;

  const pending =
    orgsQuery.isPending || (!!orgId && summariesQuery.isPending);

  const loadError =
    orgsQuery.error instanceof Error
      ? orgsQuery.error.message
      : summariesQuery.error instanceof Error
        ? summariesQuery.error.message
        : null;

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

  const createProjectMut = useMutation({
    mutationFn: createProjectRequest,
    onSuccess: () => {
      if (orgId) {
        void queryClient.invalidateQueries({
          queryKey: dashboardKeys.projectSummaries(orgId),
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

  async function handleCreateProject(input: { name: string }) {
    if (!selectedOrganizationId) {
      throw new Error("Select an organization before creating a project.");
    }

    const fallbackSlug =
      input.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63) || "project";
    const project = await createProjectMut.mutateAsync({
      name: input.name,
      organizationId: selectedOrganizationId,
      slug: fallbackSlug.length >= 2 ? fallbackSlug : `${fallbackSlug}-project`,
    });

    await navigate({
      to: "/$organizationSlug/projects/$projectSlug",
      params: { organizationSlug, projectSlug: project.slug },
    });
  }

  async function handleSignOut() {
    await authClient.signOut();
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/login" });
  }

  return (
    <DashboardShell
      activeNav="projects"
      headerStatus={healthStatus}
      onSignOut={handleSignOut}
      organizationSlug={organizationSlug}
      user={auth.user}
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
        errorMessage={loadError}
        loading={pending}
        onCreateProject={handleCreateProject}
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
        summaries={summaries}
      />
    </DashboardShell>
  );
}

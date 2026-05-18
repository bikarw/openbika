import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as React from "react";

import { authClient } from "#/auth-client";
import { GitProvidersPanel } from "#/components/git-providers-panel";
import { DashboardShell } from "#/components/dashboard-shell";
import { OrgSwitcher } from "#/components/org-switcher";
import {
  dashboardKeys,
  fetchGitProviders,
  fetchHealthOk,
  fetchOrganizations,
} from "#/lib/dashboard-api-queries";
import {
  readStoredOrganizationId,
  writeStoredOrganizationId,
} from "#/lib/selected-organization";
import { Route as RootRoute } from "#/routes/__root";

export const Route = createFileRoute("/_protected/$organizationSlug/git/")({
  component: GitProvidersPage,
});

function pickOrganization(
  organizations: { id: string; slug: string }[],
): { id: string; slug: string } | null {
  if (organizations.length === 0) return null;
  const stored = readStoredOrganizationId();
  const storedOrganization = organizations.find((o) => o.id === stored);
  if (storedOrganization) {
    return storedOrganization;
  }
  return organizations[0] ?? null;
}

function GitProvidersPage() {
  const { organizationSlug } = Route.useParams();
  const { auth } = RootRoute.useRouteContext();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: dashboardKeys.organizations(),
    queryFn: fetchOrganizations,
  });

  const organizations = orgsQuery.data ?? [];
  const activeOrg = organizations.find((o) => o.slug === organizationSlug);
  const orgId = activeOrg?.id ?? null;
  const canManage =
    activeOrg?.role === "owner" || activeOrg?.role === "admin";

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
      params: { organizationSlug: fallback.slug },
      replace: true,
      to: "/$organizationSlug/git",
    });
  }, [orgsQuery.data, orgsQuery.isPending, organizationSlug, navigate]);

  const healthQuery = useQuery({
    queryKey: dashboardKeys.health(),
    queryFn: fetchHealthOk,
  });

  const providersQuery = useQuery({
    enabled: orgId !== null,
    queryFn: () => fetchGitProviders(orgId as string),
    queryKey: dashboardKeys.gitProviders(orgId ?? ""),
  });

  const pending =
    orgsQuery.isPending || (orgId !== null && providersQuery.isPending);

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

  function handleSelectOrganization(organizationId: string) {
    const organization = organizations.find((org) => org.id === organizationId);
    if (!organization) return;

    writeStoredOrganizationId(organization.id);
    void navigate({
      params: { organizationSlug: organization.slug },
      to: "/$organizationSlug/git",
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
      activeNav="git"
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
          selectedOrganizationId={orgId}
        />
      }
    >
      <GitProvidersPanel
        canManage={canManage}
        organizationId={orgId}
        organizationSlug={organizationSlug}
        providers={providersQuery.data ?? []}
        providersError={providersQuery.isError}
        providersPending={providersQuery.isPending}
      />
    </DashboardShell>
  );
}

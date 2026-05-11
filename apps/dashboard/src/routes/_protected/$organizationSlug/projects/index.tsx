import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import type {
  OrganizationResponse,
  ProjectSummaryResponse,
} from "@openbika/contracts";
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

function ProjectsRoutePage() {
  const { organizationSlug } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();

  const [organizations, setOrganizations] = React.useState<
    OrganizationResponse[]
  >([]);
  const [summaries, setSummaries] = React.useState<ProjectSummaryResponse[]>(
    [],
  );
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(true);
  const [healthStatus, setHealthStatus] = React.useState<
    "error" | "loading" | "ok" | null
  >(null);

  const selectedOrganizationId =
    organizations.find((o) => o.slug === organizationSlug)?.id ?? null;
  const hasProvisioning = summaries.some(
    (summary) =>
      summary.organizationId === selectedOrganizationId &&
      summary.isProvisioning,
  );

  React.useEffect(() => {
    let cancelled = false;
    const client = getDashboardApiClient();

    async function load(showLoading: boolean) {
      if (showLoading) {
        setPending(true);
        setLoadError(null);
        setHealthStatus("loading");
      }

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
          setSummaries([]);

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

        const [nextSummaries, healthy] = await Promise.all([
          client.listProjectSummaries(active.id),
          healthPromise,
        ]);
        if (cancelled) return;

        setOrganizations(orgs);
        setSummaries(nextSummaries);
        setHealthStatus(healthy ? "ok" : "error");
      } catch (err) {
        if (cancelled) return;
        setLoadError(
          err instanceof Error ? err.message : "Failed to load dashboard data",
        );
        setSummaries([]);
        setHealthStatus("error");
      } finally {
        if (!cancelled && showLoading) setPending(false);
      }
    }

    void load(true);
    return () => {
      cancelled = true;
    };
  }, [navigate, organizationSlug]);

  React.useEffect(() => {
    if (!hasProvisioning) return;

    const client = getDashboardApiClient();
    const orgId = selectedOrganizationId;
    if (!orgId) return;

    let cancelled = false;
    const intervalId = window.setInterval(() => {
      void client
        .listProjectSummaries(orgId)
        .then((next) => {
          if (!cancelled) setSummaries(next);
        })
        .catch(() => undefined);
    }, 3_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [hasProvisioning, selectedOrganizationId]);

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
    const fallbackSlug =
      input.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63) || "project";
    const project = await client.createProject({
      name: input.name,
      organizationId: selectedOrganizationId,
      slug: fallbackSlug.length >= 2 ? fallbackSlug : `${fallbackSlug}-project`,
    });

    await client.createDatabase(project.id, {
      name: project.slug,
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

import type {
  CreateBranchRequest,
  CreateDatabaseRequest,
  CreateProjectRequest,
  CreateWorkloadRequest,
  PatchBranchSettingsRequest,
  PatchServerDomainSettingsRequest,
  PatchWorkloadEnvRequest,
  PatchWorkloadIngressDomainsRequest,
} from "@openbika/contracts";
import type { QueryClient } from "@tanstack/react-query";

import { getDashboardApiClient } from "#/lib/openbika-client";

export const dashboardKeys = {
  root: ["dashboard-api"] as const,
  organizations: () => [...dashboardKeys.root, "organizations"] as const,
  health: () => [...dashboardKeys.root, "health"] as const,
  serverDomainSettings: () =>
    [...dashboardKeys.root, "server-domain-settings"] as const,
  s3Destinations: (organizationId: string) =>
    [...dashboardKeys.root, "s3-destinations", organizationId] as const,
  projects: (organizationId: string) =>
    [...dashboardKeys.root, "projects", organizationId] as const,
  projectSummaries: (organizationId: string) =>
    [...dashboardKeys.root, "project-summaries", organizationId] as const,
  databases: (projectId: string) =>
    [...dashboardKeys.root, "databases", projectId] as const,
  workloads: (projectId: string) =>
    [...dashboardKeys.root, "workloads", projectId] as const,
  workload: (workloadId: string) =>
    [...dashboardKeys.root, "workload", workloadId] as const,
  database: (databaseId: string) =>
    [...dashboardKeys.root, "database", databaseId] as const,
  branchSchema: (branchId: string) =>
    [...dashboardKeys.root, "branch-schema", branchId] as const,
  branchConnection: (branchId: string) =>
    [...dashboardKeys.root, "branch-connection", branchId] as const,
  workloadRuntimeLogs: (workloadId: string, tail: number) =>
    [...dashboardKeys.root, "workload-runtime-logs", workloadId, tail] as const,
};

export async function fetchOrganizations() {
  return getDashboardApiClient().listOrganizations();
}

export async function fetchHealthOk(): Promise<boolean> {
  try {
    await getDashboardApiClient().health();
    return true;
  } catch {
    return false;
  }
}

export async function fetchServerDomainSettings() {
  return getDashboardApiClient().getServerDomainSettings();
}

export async function patchServerDomainSettingsRequest(
  input: PatchServerDomainSettingsRequest,
) {
  return getDashboardApiClient().patchServerDomainSettings(input);
}

export async function fetchS3Destinations(organizationId: string) {
  return getDashboardApiClient().listS3Destinations(organizationId);
}

export async function fetchProjects(organizationId: string) {
  return getDashboardApiClient().listProjects({ organizationId });
}

export async function fetchProjectSummaries(organizationId: string) {
  return getDashboardApiClient().listProjectSummaries(organizationId);
}

export async function fetchDatabases(projectId: string) {
  return getDashboardApiClient().listDatabases(projectId);
}

export async function fetchWorkloads(projectId: string) {
  return getDashboardApiClient().listWorkloads(projectId);
}

export async function fetchWorkload(workloadId: string) {
  return getDashboardApiClient().getWorkload(workloadId);
}

export async function fetchDatabase(databaseId: string) {
  return getDashboardApiClient().getDatabase(databaseId);
}

export async function fetchBranchSchema(branchId: string) {
  return getDashboardApiClient().getBranchSchema(branchId);
}

export async function fetchBranchConnection(branchId: string) {
  return getDashboardApiClient().getBranchConnection(branchId);
}

export async function patchBranchSettingsRequest(
  branchId: string,
  input: PatchBranchSettingsRequest,
) {
  return getDashboardApiClient().patchBranchSettings(branchId, input);
}

export async function fetchWorkloadRuntimeLogs(
  workloadId: string,
  tail: number,
) {
  return getDashboardApiClient().getWorkloadRuntimeLogs(workloadId, { tail });
}

export async function createProjectRequest(input: CreateProjectRequest) {
  return getDashboardApiClient().createProject(input);
}

export async function createWorkloadRequest(
  projectId: string,
  input: CreateWorkloadRequest,
) {
  return getDashboardApiClient().createWorkload(projectId, input);
}

export async function createDatabaseRequest(
  projectId: string,
  input: CreateDatabaseRequest,
) {
  return getDashboardApiClient().createDatabase(projectId, input);
}

export async function createBranchRequest(
  databaseId: string,
  input: CreateBranchRequest,
) {
  return getDashboardApiClient().createBranch(databaseId, input);
}

export async function rebuildWorkloadRequest(workloadId: string) {
  return getDashboardApiClient().rebuildWorkload(workloadId);
}

export async function patchWorkloadEnvRequest(
  workloadId: string,
  input: PatchWorkloadEnvRequest,
) {
  return getDashboardApiClient().patchWorkloadEnv(workloadId, input);
}

export async function patchWorkloadDomainsRequest(
  workloadId: string,
  input: PatchWorkloadIngressDomainsRequest,
) {
  return getDashboardApiClient().patchWorkloadDomains(workloadId, input);
}

export async function executeBranchSql(
  branchId: string,
  input: { readOnly: boolean; sql: string },
) {
  return getDashboardApiClient().executeBranchQuery(branchId, input);
}

/** Resolve database id for a branch; uses TanStack Query cache when primed. */
export async function resolveDatabaseIdForBranchCached(
  queryClient: QueryClient,
  organizationSlug: string,
  projectSlug: string,
  branchId: string,
): Promise<string | null> {
  try {
    const orgs = await queryClient.ensureQueryData({
      queryKey: dashboardKeys.organizations(),
      queryFn: fetchOrganizations,
    });
    const organization = orgs.find((org) => org.slug === organizationSlug);
    if (!organization) return null;

    const projects = await queryClient.ensureQueryData({
      queryKey: dashboardKeys.projects(organization.id),
      queryFn: () => fetchProjects(organization.id),
    });
    const project = projects.find((item) => item.slug === projectSlug);
    if (!project) return null;

    const databases = await queryClient.ensureQueryData({
      queryKey: dashboardKeys.databases(project.id),
      queryFn: () => fetchDatabases(project.id),
    });
    const hit = databases.find((database) =>
      database.branches.some((branch) => branch.id === branchId),
    );

    return hit?.id ?? null;
  } catch {
    return null;
  }
}

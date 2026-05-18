import type {
  CreateBackupRequest,
  CreateBackupScheduleRequest,
  CreateBitbucketProviderRequest,
  CreateBranchRequest,
  CreateDatabaseRequest,
  CreateGiteaProviderRequest,
  CreateGitlabProviderRequest,
  CreateDraftWorkloadRequest,
  PrepareGithubManifestRequest,
  CreateProjectRequest,
  CreateRestoreRequest,
  CreateWorkloadRequest,
  PatchBackupScheduleRequest,
  PatchBitbucketProviderRequest,
  PatchBranchSettingsRequest,
  PatchGiteaProviderRequest,
  PatchGithubProviderRequest,
  PatchGitlabProviderRequest,
  PatchWorkloadConfigRequest,
  PatchServerDomainSettingsRequest,
  PatchWorkloadEnvRequest,
  PatchWorkloadIngressDomainsRequest,
  RenameGitProviderRequest,
  GitProviderType,
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
  databaseBackups: (databaseId: string, branchId?: string) =>
    [
      ...dashboardKeys.root,
      "database-backups",
      databaseId,
      branchId ?? "all",
    ] as const,
  backupSchedules: (databaseId: string, branchId?: string) =>
    [
      ...dashboardKeys.root,
      "backup-schedules",
      databaseId,
      branchId ?? "all",
    ] as const,
  gitProviders: (organizationId: string) =>
    [...dashboardKeys.root, "git-providers", organizationId] as const,
  gitRepositories: (
    providerType: "github" | "gitlab" | "bitbucket" | "gitea",
    gitProviderId: string,
  ) =>
    [
      ...dashboardKeys.root,
      "git-repositories",
      providerType,
      gitProviderId,
    ] as const,
  gitBranches: (
    providerType: "github" | "gitlab" | "bitbucket" | "gitea",
    gitProviderId: string,
    repoKey: string,
  ) =>
    [
      ...dashboardKeys.root,
      "git-branches",
      providerType,
      gitProviderId,
      repoKey,
    ] as const,
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

export async function createDraftWorkloadRequest(
  projectId: string,
  input: CreateDraftWorkloadRequest,
) {
  return getDashboardApiClient().createDraftWorkload(projectId, input);
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

export async function deployWorkloadRequest(workloadId: string) {
  return getDashboardApiClient().deployWorkload(workloadId);
}

export async function patchWorkloadConfigRequest(
  workloadId: string,
  input: PatchWorkloadConfigRequest,
) {
  return getDashboardApiClient().patchWorkloadConfig(workloadId, input);
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

export async function fetchDatabaseBackups(
  databaseId: string,
  branchId?: string,
) {
  return getDashboardApiClient().listDatabaseBackups(
    databaseId,
    branchId ? { branchId } : {},
  );
}

export async function createDatabaseBackupRequest(
  databaseId: string,
  input: CreateBackupRequest,
) {
  return getDashboardApiClient().createBackup(databaseId, input);
}

export async function createRestoreRequest(
  backupJobId: string,
  input: CreateRestoreRequest,
) {
  return getDashboardApiClient().createRestore(backupJobId, input);
}

export async function fetchBackupSchedules(
  databaseId: string,
  branchId?: string,
) {
  return getDashboardApiClient().listBackupSchedules(
    databaseId,
    branchId ? { branchId } : {},
  );
}

export async function createBackupScheduleRequest(
  databaseId: string,
  input: CreateBackupScheduleRequest,
) {
  return getDashboardApiClient().createBackupSchedule(databaseId, input);
}

export async function patchBackupScheduleRequest(
  scheduleId: string,
  input: PatchBackupScheduleRequest,
) {
  return getDashboardApiClient().patchBackupSchedule(scheduleId, input);
}

export async function deleteBackupScheduleRequest(scheduleId: string) {
  return getDashboardApiClient().deleteBackupSchedule(scheduleId);
}

// --- Git providers ---------------------------------------------------------

export async function fetchGitProviders(organizationId: string) {
  return getDashboardApiClient().listGitProviders(organizationId);
}

export async function fetchGitRepositories(
  providerType: GitProviderType,
  gitProviderId: string,
) {
  const client = getDashboardApiClient();
  switch (providerType) {
    case "github":
      return client.listGithubRepositories(gitProviderId);
    case "gitlab":
      return client.listGitlabRepositories(gitProviderId);
    case "bitbucket":
      return client.listBitbucketRepositories(gitProviderId);
    case "gitea":
      return client.listGiteaRepositories(gitProviderId);
    default: {
      const exhaustive: never = providerType;
      return exhaustive;
    }
  }
}

export async function fetchGitBranches(input: {
  gitProviderId: string;
  providerType: GitProviderType;
  repositoryFullName: string;
  repositoryId?: string | number;
}) {
  const client = getDashboardApiClient();
  const [owner, repo] = input.repositoryFullName.split("/", 2);

  switch (input.providerType) {
    case "github":
    case "gitea":
      if (!owner || !repo) return [];
      return input.providerType === "github"
        ? client.listGithubBranches(input.gitProviderId, owner, repo)
        : client.listGiteaBranches(input.gitProviderId, owner, repo);
    case "gitlab":
      if (input.repositoryId === undefined) return [];
      return client.listGitlabBranches(input.gitProviderId, String(input.repositoryId));
    case "bitbucket":
      if (!owner || !repo) return [];
      return client.listBitbucketBranches(input.gitProviderId, owner, repo);
    default: {
      const exhaustive: never = input.providerType;
      return exhaustive;
    }
  }
}

export async function renameGitProviderRequest(
  gitProviderId: string,
  input: RenameGitProviderRequest,
) {
  return getDashboardApiClient().renameGitProvider(gitProviderId, input);
}

export async function deleteGitProviderRequest(gitProviderId: string) {
  return getDashboardApiClient().deleteGitProvider(gitProviderId);
}

export async function prepareGithubManifestRequest(
  input: PrepareGithubManifestRequest,
) {
  return getDashboardApiClient().prepareGithubManifest(input);
}

export async function patchGithubProviderRequest(
  gitProviderId: string,
  input: PatchGithubProviderRequest,
) {
  return getDashboardApiClient().patchGithubProvider(gitProviderId, input);
}

export async function testGithubProviderRequest(gitProviderId: string) {
  return getDashboardApiClient().testGithubProvider(gitProviderId);
}

export async function createGitlabProviderRequest(
  input: CreateGitlabProviderRequest,
) {
  return getDashboardApiClient().createGitlabProvider(input);
}

export async function patchGitlabProviderRequest(
  gitProviderId: string,
  input: PatchGitlabProviderRequest,
) {
  return getDashboardApiClient().patchGitlabProvider(gitProviderId, input);
}

export async function testGitlabProviderRequest(gitProviderId: string) {
  return getDashboardApiClient().testGitlabProvider(gitProviderId);
}

export async function createBitbucketProviderRequest(
  input: CreateBitbucketProviderRequest,
) {
  return getDashboardApiClient().createBitbucketProvider(input);
}

export async function patchBitbucketProviderRequest(
  gitProviderId: string,
  input: PatchBitbucketProviderRequest,
) {
  return getDashboardApiClient().patchBitbucketProvider(gitProviderId, input);
}

export async function testBitbucketProviderRequest(gitProviderId: string) {
  return getDashboardApiClient().testBitbucketProvider(gitProviderId);
}

export async function createGiteaProviderRequest(
  input: CreateGiteaProviderRequest,
) {
  return getDashboardApiClient().createGiteaProvider(input);
}

export async function patchGiteaProviderRequest(
  gitProviderId: string,
  input: PatchGiteaProviderRequest,
) {
  return getDashboardApiClient().patchGiteaProvider(gitProviderId, input);
}

export async function testGiteaProviderRequest(gitProviderId: string) {
  return getDashboardApiClient().testGiteaProvider(gitProviderId);
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

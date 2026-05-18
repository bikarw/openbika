import {
  type BackupJobResponse,
  type BackupScheduleResponse,
  type BranchConnectionResponse,
  branchConnectionResponseSchema,
  type BranchQueryResponse,
  branchQueryResponseSchema,
  type BranchSchemaResponse,
  branchSchemaResponseSchema,
  backupJobResponseSchema,
  backupScheduleResponseSchema,
  type BranchResponse,
  branchResponseSchema,
  type CreateBackupRequest,
  type CreateBackupScheduleRequest,
  type CreateBitbucketProviderRequest,
  type CreateBranchRequest,
  type CreateDatabaseRequest,
  type CreateGiteaProviderRequest,
  type CreateGitlabProviderRequest,
  type PrepareGithubManifestRequest,
  type PrepareGithubManifestResponse,
  prepareGithubManifestResponseSchema,
  type CreateOrganizationRequest,
  type CreateProjectRequest,
  type CreateRestoreRequest,
  type CreateS3DestinationRequest,
  type CreateDraftWorkloadRequest,
  type CreateWorkloadRequest,
  type DatabaseResponse,
  databaseResponseSchema,
  type ExecuteBranchQueryRequest,
  type GitBranchListResponse,
  gitBranchListResponseSchema,
  type GitProviderResponse,
  gitProviderResponseSchema,
  type GitRepositoryListResponse,
  gitRepositoryListResponseSchema,
  type HealthResponse,
  healthResponseSchema,
  type OrganizationResponse,
  organizationResponseSchema,
  type PatchBackupScheduleRequest,
  type PatchBitbucketProviderRequest,
  type PatchBranchSettingsRequest,
  type PatchGiteaProviderRequest,
  type PatchGithubProviderRequest,
  type PatchGitlabProviderRequest,
  type PatchWorkloadConfigRequest,
  type PatchS3DestinationRequest,
  type ProjectResponse,
  type PatchWorkloadEnvRequest,
  type PatchWorkloadIngressDomainsRequest,
  type PatchServerDomainSettingsRequest,
  projectResponseSchema,
  type ProjectSummaryResponse,
  projectSummaryResponseSchema,
  type RenameGitProviderRequest,
  type RestoreJobResponse,
  restoreJobResponseSchema,
  type S3DestinationResponse,
  s3DestinationResponseSchema,
  type ServerDomainSettingsResponse,
  serverDomainSettingsResponseSchema,
  type TestGitConnectionResponse,
  testGitConnectionResponseSchema,
  type WorkloadResponse,
  workloadResponseSchema,
  type WorkloadRuntimeLogsResponse,
  workloadRuntimeLogsResponseSchema,
} from "@openbika/contracts";

export interface OpenbikaClientOptions {
  baseUrl: string;
  credentials?: RequestCredentials;
  fetch?: typeof fetch;
  headers?: HeadersInit;
}

export interface OpenbikaUser {
  email: string;
  id: string;
  name: string;
}

export type CreateDatabaseInput = Omit<
  CreateDatabaseRequest,
  "postgresVersion"
> &
  Partial<Pick<CreateDatabaseRequest, "postgresVersion">>;

export interface ListProjectsInput {
  organizationId?: string;
}

export type CreateRestoreInput = Partial<CreateRestoreRequest>;

export type ExecuteBranchQueryInput = ExecuteBranchQueryRequest;

export class OpenbikaApiError extends Error {
  readonly details: unknown;
  readonly requestId?: string;
  readonly status: number;

  constructor({
    details,
    message,
    requestId,
    status,
  }: {
    details: unknown;
    message: string;
    requestId?: string;
    status: number;
  }) {
    super(message);
    this.name = "OpenbikaApiError";
    this.details = details;
    this.requestId = requestId;
    this.status = status;
  }
}

interface RequestOptions<TResponse> {
  body?: unknown;
  method?: "DELETE" | "GET" | "PATCH" | "POST";
  parse: (body: unknown) => TResponse;
  path: string;
}

export class OpenbikaClient {
  private readonly baseUrl: string;
  private readonly credentials?: RequestCredentials;
  private readonly fetchImpl: typeof fetch;
  private readonly headers: HeadersInit;

  constructor({
    baseUrl,
    credentials,
    fetch: fetchImpl,
    headers = {},
  }: OpenbikaClientOptions) {
    const resolvedFetch = fetchImpl ?? globalThis.fetch;

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.credentials = credentials;
    this.fetchImpl =
      resolvedFetch === globalThis.fetch
        ? resolvedFetch.bind(globalThis)
        : resolvedFetch;
    this.headers = headers;
  }

  async health(): Promise<HealthResponse> {
    return this.request({
      parse: (body) => healthResponseSchema.parse(body),
      path: "/health",
    });
  }

  async me(): Promise<OpenbikaUser> {
    return this.request({
      parse: (body) => parseUser(readProperty(body, "user")),
      path: "/v1/me",
    });
  }

  async listOrganizations(): Promise<OrganizationResponse[]> {
    return this.request({
      parse: (body) =>
        organizationResponseSchema
          .array()
          .parse(readProperty(body, "organizations")),
      path: "/v1/organizations",
    });
  }

  async createOrganization(
    input: CreateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        organizationResponseSchema.parse(readProperty(body, "organization")),
      path: "/v1/organizations",
    });
  }

  async getServerDomainSettings(): Promise<ServerDomainSettingsResponse> {
    return this.request({
      parse: (body) =>
        serverDomainSettingsResponseSchema.parse(
          readProperty(body, "settings"),
        ),
      path: "/v1/settings/server-domain",
    });
  }

  async patchServerDomainSettings(
    input: PatchServerDomainSettingsRequest,
  ): Promise<ServerDomainSettingsResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        serverDomainSettingsResponseSchema.parse(
          readProperty(body, "settings"),
        ),
      path: "/v1/settings/server-domain",
    });
  }

  async listS3Destinations(
    organizationId: string,
  ): Promise<S3DestinationResponse[]> {
    const search = new URLSearchParams({ organizationId });

    return this.request({
      parse: (body) =>
        s3DestinationResponseSchema
          .array()
          .parse(readProperty(body, "destinations")),
      path: `/v1/s3-destinations?${search}`,
    });
  }

  async createS3Destination(
    input: CreateS3DestinationRequest,
  ): Promise<S3DestinationResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        s3DestinationResponseSchema.parse(readProperty(body, "destination")),
      path: "/v1/s3-destinations",
    });
  }

  async patchS3Destination(
    destinationId: string,
    input: PatchS3DestinationRequest,
  ): Promise<S3DestinationResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        s3DestinationResponseSchema.parse(readProperty(body, "destination")),
      path: `/v1/s3-destinations/${encodeURIComponent(destinationId)}`,
    });
  }

  async deleteS3Destination(destinationId: string): Promise<void> {
    await this.request({
      method: "DELETE",
      parse: () => undefined,
      path: `/v1/s3-destinations/${encodeURIComponent(destinationId)}`,
    });
  }

  // --- Git providers -------------------------------------------------------

  async listGitProviders(
    organizationId: string,
  ): Promise<GitProviderResponse[]> {
    const search = new URLSearchParams({ organizationId });
    return this.request({
      parse: (body) =>
        gitProviderResponseSchema
          .array()
          .parse(readProperty(body, "providers")),
      path: `/v1/git-providers?${search.toString()}`,
    });
  }

  async renameGitProvider(
    gitProviderId: string,
    input: RenameGitProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: `/v1/git-providers/${encodeURIComponent(gitProviderId)}`,
    });
  }

  async deleteGitProvider(gitProviderId: string): Promise<void> {
    await this.request({
      method: "DELETE",
      parse: () => undefined,
      path: `/v1/git-providers/${encodeURIComponent(gitProviderId)}`,
    });
  }

  // GitHub
  /**
   * Build the GitHub App manifest + the `actionUrl` the browser should POST to.
   * No DB row is created here; the row is inserted when GitHub redirects back
   * to /v1/providers/github/setup with the code.
   */
  async prepareGithubManifest(
    input: PrepareGithubManifestRequest,
  ): Promise<PrepareGithubManifestResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) => prepareGithubManifestResponseSchema.parse(body),
      path: "/v1/git-providers/github/prepare-manifest",
    });
  }

  async patchGithubProvider(
    gitProviderId: string,
    input: PatchGithubProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: `/v1/git-providers/github/${encodeURIComponent(gitProviderId)}`,
    });
  }

  async testGithubProvider(
    gitProviderId: string,
  ): Promise<TestGitConnectionResponse> {
    return this.request({
      method: "POST",
      parse: (body) => testGitConnectionResponseSchema.parse(body),
      path: `/v1/git-providers/github/${encodeURIComponent(gitProviderId)}/test`,
    });
  }

  async listGithubRepositories(
    gitProviderId: string,
  ): Promise<GitRepositoryListResponse> {
    return this.request({
      parse: (body) =>
        gitRepositoryListResponseSchema.parse(
          readProperty(body, "repositories"),
        ),
      path: `/v1/git-providers/github/${encodeURIComponent(gitProviderId)}/repositories`,
    });
  }

  async listGithubBranches(
    gitProviderId: string,
    owner: string,
    repo: string,
  ): Promise<GitBranchListResponse> {
    const search = new URLSearchParams({ owner, repo });
    return this.request({
      parse: (body) =>
        gitBranchListResponseSchema.parse(readProperty(body, "branches")),
      path: `/v1/git-providers/github/${encodeURIComponent(gitProviderId)}/branches?${search.toString()}`,
    });
  }

  // GitLab
  async createGitlabProvider(
    input: CreateGitlabProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: "/v1/git-providers/gitlab",
    });
  }

  async patchGitlabProvider(
    gitProviderId: string,
    input: PatchGitlabProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: `/v1/git-providers/gitlab/${encodeURIComponent(gitProviderId)}`,
    });
  }

  async testGitlabProvider(
    gitProviderId: string,
  ): Promise<TestGitConnectionResponse> {
    return this.request({
      method: "POST",
      parse: (body) => testGitConnectionResponseSchema.parse(body),
      path: `/v1/git-providers/gitlab/${encodeURIComponent(gitProviderId)}/test`,
    });
  }

  async listGitlabRepositories(
    gitProviderId: string,
  ): Promise<GitRepositoryListResponse> {
    return this.request({
      parse: (body) =>
        gitRepositoryListResponseSchema.parse(
          readProperty(body, "repositories"),
        ),
      path: `/v1/git-providers/gitlab/${encodeURIComponent(gitProviderId)}/repositories`,
    });
  }

  async listGitlabBranches(
    gitProviderId: string,
    projectId: string,
  ): Promise<GitBranchListResponse> {
    const search = new URLSearchParams({ projectId });
    return this.request({
      parse: (body) =>
        gitBranchListResponseSchema.parse(readProperty(body, "branches")),
      path: `/v1/git-providers/gitlab/${encodeURIComponent(gitProviderId)}/branches?${search.toString()}`,
    });
  }

  // Bitbucket
  async createBitbucketProvider(
    input: CreateBitbucketProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: "/v1/git-providers/bitbucket",
    });
  }

  async patchBitbucketProvider(
    gitProviderId: string,
    input: PatchBitbucketProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: `/v1/git-providers/bitbucket/${encodeURIComponent(gitProviderId)}`,
    });
  }

  async testBitbucketProvider(
    gitProviderId: string,
  ): Promise<TestGitConnectionResponse> {
    return this.request({
      method: "POST",
      parse: (body) => testGitConnectionResponseSchema.parse(body),
      path: `/v1/git-providers/bitbucket/${encodeURIComponent(gitProviderId)}/test`,
    });
  }

  async listBitbucketRepositories(
    gitProviderId: string,
  ): Promise<GitRepositoryListResponse> {
    return this.request({
      parse: (body) =>
        gitRepositoryListResponseSchema.parse(
          readProperty(body, "repositories"),
        ),
      path: `/v1/git-providers/bitbucket/${encodeURIComponent(gitProviderId)}/repositories`,
    });
  }

  async listBitbucketBranches(
    gitProviderId: string,
    workspace: string,
    repoSlug: string,
  ): Promise<GitBranchListResponse> {
    const search = new URLSearchParams({ workspace, repoSlug });
    return this.request({
      parse: (body) =>
        gitBranchListResponseSchema.parse(readProperty(body, "branches")),
      path: `/v1/git-providers/bitbucket/${encodeURIComponent(gitProviderId)}/branches?${search.toString()}`,
    });
  }

  // Gitea
  async createGiteaProvider(
    input: CreateGiteaProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: "/v1/git-providers/gitea",
    });
  }

  async patchGiteaProvider(
    gitProviderId: string,
    input: PatchGiteaProviderRequest,
  ): Promise<GitProviderResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        gitProviderResponseSchema.parse(readProperty(body, "provider")),
      path: `/v1/git-providers/gitea/${encodeURIComponent(gitProviderId)}`,
    });
  }

  async testGiteaProvider(
    gitProviderId: string,
  ): Promise<TestGitConnectionResponse> {
    return this.request({
      method: "POST",
      parse: (body) => testGitConnectionResponseSchema.parse(body),
      path: `/v1/git-providers/gitea/${encodeURIComponent(gitProviderId)}/test`,
    });
  }

  async listGiteaRepositories(
    gitProviderId: string,
  ): Promise<GitRepositoryListResponse> {
    return this.request({
      parse: (body) =>
        gitRepositoryListResponseSchema.parse(
          readProperty(body, "repositories"),
        ),
      path: `/v1/git-providers/gitea/${encodeURIComponent(gitProviderId)}/repositories`,
    });
  }

  async listGiteaBranches(
    gitProviderId: string,
    owner: string,
    repo: string,
  ): Promise<GitBranchListResponse> {
    const search = new URLSearchParams({ owner, repo });
    return this.request({
      parse: (body) =>
        gitBranchListResponseSchema.parse(readProperty(body, "branches")),
      path: `/v1/git-providers/gitea/${encodeURIComponent(gitProviderId)}/branches?${search.toString()}`,
    });
  }

  /** Build the base URL for an OAuth callback (used by Add provider forms). */
  gitOauthCallbackUrls(): {
    githubSetup: string;
    gitlabCallback: string;
    giteaAuthorize: (gitProviderId: string) => string;
    giteaCallback: string;
  } {
    return {
      githubSetup: `${this.baseUrl}/v1/providers/github/setup`,
      gitlabCallback: `${this.baseUrl}/v1/providers/gitlab/callback`,
      giteaAuthorize: (gitProviderId: string) =>
        `${this.baseUrl}/v1/providers/gitea/authorize?gitProviderId=${encodeURIComponent(gitProviderId)}`,
      giteaCallback: `${this.baseUrl}/v1/providers/gitea/callback`,
    };
  }

  async listProjects(
    input: ListProjectsInput = {},
  ): Promise<ProjectResponse[]> {
    const search = new URLSearchParams();

    if (input.organizationId) {
      search.set("organizationId", input.organizationId);
    }

    return this.request({
      parse: (body) =>
        projectResponseSchema.array().parse(readProperty(body, "projects")),
      path: search.size > 0 ? `/v1/projects?${search}` : "/v1/projects",
    });
  }

  async listProjectSummaries(
    organizationId: string,
  ): Promise<ProjectSummaryResponse[]> {
    const search = new URLSearchParams({ organizationId });

    return this.request({
      parse: (body) =>
        projectSummaryResponseSchema
          .array()
          .parse(readProperty(body, "summaries")),
      path: `/v1/projects/summaries?${search}`,
    });
  }

  async createProject(input: CreateProjectRequest): Promise<ProjectResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        projectResponseSchema.parse(readProperty(body, "project")),
      path: "/v1/projects",
    });
  }

  async listDatabases(projectId: string): Promise<DatabaseResponse[]> {
    return this.request({
      parse: (body) =>
        databaseResponseSchema.array().parse(readProperty(body, "databases")),
      path: `/v1/projects/${encodeURIComponent(projectId)}/databases`,
    });
  }

  async createDatabase(
    projectId: string,
    input: CreateDatabaseInput,
  ): Promise<DatabaseResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        databaseResponseSchema.parse(readProperty(body, "database")),
      path: `/v1/projects/${encodeURIComponent(projectId)}/databases`,
    });
  }

  async listWorkloads(projectId: string): Promise<WorkloadResponse[]> {
    return this.request({
      parse: (body) =>
        workloadResponseSchema.array().parse(readProperty(body, "workloads")),
      path: `/v1/projects/${encodeURIComponent(projectId)}/workloads`,
    });
  }

  async createWorkload(
    projectId: string,
    input: CreateWorkloadRequest,
  ): Promise<WorkloadResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/projects/${encodeURIComponent(projectId)}/workloads`,
    });
  }

  async createDraftWorkload(
    projectId: string,
    input: CreateDraftWorkloadRequest,
  ): Promise<WorkloadResponse> {
    return this.createWorkload(projectId, input);
  }

  async getWorkload(workloadId: string): Promise<WorkloadResponse> {
    return this.request({
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}`,
    });
  }

  async getWorkloadRuntimeLogs(
    workloadId: string,
    input: { tail?: number } = {},
  ): Promise<WorkloadRuntimeLogsResponse> {
    const search = new URLSearchParams();
    if (input.tail !== undefined) {
      search.set("tail", String(input.tail));
    }
    const query = search.size > 0 ? `?${search.toString()}` : "";

    return this.request({
      parse: (body) => workloadRuntimeLogsResponseSchema.parse(body),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}/runtime-logs${query}`,
    });
  }

  async patchWorkloadEnv(
    workloadId: string,
    input: PatchWorkloadEnvRequest,
  ): Promise<WorkloadResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}`,
    });
  }

  async patchWorkloadConfig(
    workloadId: string,
    input: PatchWorkloadConfigRequest,
  ): Promise<WorkloadResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}/config`,
    });
  }

  async patchWorkloadDomains(
    workloadId: string,
    input: PatchWorkloadIngressDomainsRequest,
  ): Promise<WorkloadResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}/domains`,
    });
  }

  async rebuildWorkload(workloadId: string): Promise<WorkloadResponse> {
    return this.request({
      method: "POST",
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}/rebuild`,
    });
  }

  async deployWorkload(workloadId: string): Promise<WorkloadResponse> {
    return this.request({
      method: "POST",
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}/deploy`,
    });
  }

  async getDatabase(databaseId: string): Promise<DatabaseResponse> {
    return this.request({
      parse: (body) =>
        databaseResponseSchema.parse(readProperty(body, "database")),
      path: `/v1/databases/${encodeURIComponent(databaseId)}`,
    });
  }

  async createBranch(
    databaseId: string,
    input: CreateBranchRequest,
  ): Promise<BranchResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) => branchResponseSchema.parse(readProperty(body, "branch")),
      path: `/v1/databases/${encodeURIComponent(databaseId)}/branches`,
    });
  }

  async getBranchConnection(
    branchId: string,
  ): Promise<BranchConnectionResponse> {
    return this.request({
      parse: (body) =>
        branchConnectionResponseSchema.parse(readProperty(body, "connection")),
      path: `/v1/branches/${encodeURIComponent(branchId)}/connection`,
    });
  }

  async patchBranchSettings(
    branchId: string,
    input: PatchBranchSettingsRequest,
  ): Promise<BranchResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) => branchResponseSchema.parse(readProperty(body, "branch")),
      path: `/v1/branches/${encodeURIComponent(branchId)}/settings`,
    });
  }

  async getBranchSchema(branchId: string): Promise<BranchSchemaResponse> {
    return this.request({
      parse: (body) =>
        branchSchemaResponseSchema.parse(readProperty(body, "schema")),
      path: `/v1/branches/${encodeURIComponent(branchId)}/schema`,
    });
  }

  async executeBranchQuery(
    branchId: string,
    input: ExecuteBranchQueryInput,
  ): Promise<BranchQueryResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        branchQueryResponseSchema.parse(readProperty(body, "result")),
      path: `/v1/branches/${encodeURIComponent(branchId)}/query`,
    });
  }

  async listDatabaseBackups(
    databaseId: string,
    input: { branchId?: string } = {},
  ): Promise<BackupJobResponse[]> {
    const search = new URLSearchParams();
    if (input.branchId) {
      search.set("branchId", input.branchId);
    }
    const query = search.size > 0 ? `?${search.toString()}` : "";
    return this.request({
      parse: (body) =>
        backupJobResponseSchema
          .array()
          .parse(readProperty(body, "backupJobs")),
      path: `/v1/databases/${encodeURIComponent(databaseId)}/backups${query}`,
    });
  }

  async createBackup(
    databaseId: string,
    input: CreateBackupRequest = {},
  ): Promise<BackupJobResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        backupJobResponseSchema.parse(readProperty(body, "backupJob")),
      path: `/v1/databases/${encodeURIComponent(databaseId)}/backups`,
    });
  }

  async getBackup(backupJobId: string): Promise<BackupJobResponse> {
    return this.request({
      parse: (body) =>
        backupJobResponseSchema.parse(readProperty(body, "backupJob")),
      path: `/v1/backups/${encodeURIComponent(backupJobId)}`,
    });
  }

  async createRestore(
    backupJobId: string,
    input: CreateRestoreInput = {},
  ): Promise<RestoreJobResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        restoreJobResponseSchema.parse(readProperty(body, "restoreJob")),
      path: `/v1/backups/${encodeURIComponent(backupJobId)}/restores`,
    });
  }

  async listBackupSchedules(
    databaseId: string,
    input: { branchId?: string } = {},
  ): Promise<BackupScheduleResponse[]> {
    const search = new URLSearchParams();
    if (input.branchId) {
      search.set("branchId", input.branchId);
    }
    const query = search.size > 0 ? `?${search.toString()}` : "";
    return this.request({
      parse: (body) =>
        backupScheduleResponseSchema
          .array()
          .parse(readProperty(body, "schedules")),
      path: `/v1/databases/${encodeURIComponent(databaseId)}/backup-schedules${query}`,
    });
  }

  async createBackupSchedule(
    databaseId: string,
    input: CreateBackupScheduleRequest,
  ): Promise<BackupScheduleResponse> {
    return this.request({
      body: input,
      method: "POST",
      parse: (body) =>
        backupScheduleResponseSchema.parse(readProperty(body, "schedule")),
      path: `/v1/databases/${encodeURIComponent(databaseId)}/backup-schedules`,
    });
  }

  async patchBackupSchedule(
    scheduleId: string,
    input: PatchBackupScheduleRequest,
  ): Promise<BackupScheduleResponse> {
    return this.request({
      body: input,
      method: "PATCH",
      parse: (body) =>
        backupScheduleResponseSchema.parse(readProperty(body, "schedule")),
      path: `/v1/backup-schedules/${encodeURIComponent(scheduleId)}`,
    });
  }

  async deleteBackupSchedule(scheduleId: string): Promise<void> {
    await this.request({
      method: "DELETE",
      parse: () => undefined,
      path: `/v1/backup-schedules/${encodeURIComponent(scheduleId)}`,
    });
  }

  private async request<TResponse>({
    body,
    method = "GET",
    parse,
    path,
  }: RequestOptions<TResponse>): Promise<TResponse> {
    const headers = new Headers(this.headers);
    const init: RequestInit = {
      credentials: this.credentials,
      headers,
      method,
    };

    if (body !== undefined) {
      if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      init.body = JSON.stringify(body);
    }

    const response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    const responseBody = await readApiJsonBody(response);

    if (!response.ok) {
      throw createApiError(response, responseBody);
    }

    return parse(responseBody);
  }
}

/**
 * Parses a response body after trimming UTF-8 BOM and surrounding whitespace.
 * Tolerates a leading `null` / garbage prefix concatenated before the payload
 * (e.g. `null{"workloads":[]}`) by extracting the first top-level `{`/`[...]` value.
 */
function parseLenientApiJson(raw: string): unknown {
  const withoutBom = raw.replace(/^\uFEFF/u, "");
  const trimmed = withoutBom.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const slice = sliceFirstTopLevelJson(trimmed);
    if (slice !== null) {
      return JSON.parse(slice);
    }
    throw new SyntaxError("Body is not valid JSON");
  }
}

function sliceFirstTopLevelJson(text: string): string | null {
  const startObj = text.indexOf("{");
  const startArr = text.indexOf("[");
  const start =
    startObj === -1
      ? startArr
      : startArr === -1
        ? startObj
        : Math.min(startObj, startArr);

  if (start < 0) {
    return null;
  }

  const s = text.slice(start);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }

    if (c === '"') {
      inString = true;
      continue;
    }

    if (c === "{" || c === "[") {
      stack.push(c === "{" ? "}" : "]");
      continue;
    }

    if (c === "}" || c === "]") {
      const expected = stack[stack.length - 1];
      if (c !== expected) {
        return null;
      }
      stack.pop();
      if (stack.length === 0) {
        return s.slice(0, i + 1);
      }
    }
  }

  return null;
}

function previewBody(text: string, max = 200): string {
  const oneLine = text.replace(/\s+/gu, " ").trim();
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`;
}

async function readApiJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return parseLenientApiJson(text);
  } catch (cause) {
    const contentType = response.headers.get("content-type") ?? "unknown";
    const message = `Openbika API returned a non-JSON response (HTTP ${String(response.status)}, ${contentType}): ${previewBody(text)}`;
    throw new SyntaxError(message, { cause });
  }
}

function createApiError(response: Response, body: unknown): OpenbikaApiError {
  if (isRecord(body)) {
    const message = typeof body.message === "string" ? body.message : undefined;
    const requestId =
      typeof body.requestId === "string" ? body.requestId : undefined;

    return new OpenbikaApiError({
      details: body,
      message:
        message ?? `Openbika API request failed with HTTP ${response.status}`,
      requestId,
      status: response.status,
    });
  }

  return new OpenbikaApiError({
    details: body,
    message: `Openbika API request failed with HTTP ${response.status}`,
    status: response.status,
  });
}

function readProperty(body: unknown, property: string): unknown {
  if (!isRecord(body)) {
    throw new Error("Openbika API response body must be an object");
  }

  return body[property];
}

function parseUser(body: unknown): OpenbikaUser {
  if (!isRecord(body)) {
    throw new Error("Openbika API user response must be an object");
  }

  const { email, id, name } = body;

  if (
    typeof email !== "string" ||
    typeof id !== "string" ||
    typeof name !== "string"
  ) {
    throw new Error("Openbika API user response is invalid");
  }

  return {
    email,
    id,
    name,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

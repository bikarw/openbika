import {
  type BackupJobResponse,
  type BranchConnectionResponse,
  branchConnectionResponseSchema,
  type BranchQueryResponse,
  branchQueryResponseSchema,
  type BranchSchemaResponse,
  branchSchemaResponseSchema,
  backupJobResponseSchema,
  type BranchResponse,
  branchResponseSchema,
  type CreateBranchRequest,
  type CreateDatabaseRequest,
  type CreateOrganizationRequest,
  type CreateProjectRequest,
  type CreateRestoreRequest,
  type CreateWorkloadRequest,
  type DatabaseResponse,
  databaseResponseSchema,
  type ExecuteBranchQueryRequest,
  type HealthResponse,
  healthResponseSchema,
  type OrganizationResponse,
  organizationResponseSchema,
  type ProjectResponse,
  projectResponseSchema,
  type ProjectSummaryResponse,
  projectSummaryResponseSchema,
  type RestoreJobResponse,
  restoreJobResponseSchema,
  type WorkloadResponse,
  workloadResponseSchema,
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
  method?: "GET" | "POST";
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

  async getWorkload(workloadId: string): Promise<WorkloadResponse> {
    return this.request({
      parse: (body) =>
        workloadResponseSchema.parse(readProperty(body, "workload")),
      path: `/v1/workloads/${encodeURIComponent(workloadId)}`,
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

  async createBackup(databaseId: string): Promise<BackupJobResponse> {
    return this.request({
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
    const responseBody = await readJson(response);

    if (!response.ok) {
      throw createApiError(response, responseBody);
    }

    return parse(responseBody);
  }
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();

  if (!text) {
    return null;
  }

  return JSON.parse(text) as unknown;
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

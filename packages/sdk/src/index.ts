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
  type PatchBranchSettingsRequest,
  type ProjectResponse,
  type PatchWorkloadEnvRequest,
  type PatchWorkloadIngressDomainsRequest,
  type PatchServerDomainSettingsRequest,
  projectResponseSchema,
  type ProjectSummaryResponse,
  projectSummaryResponseSchema,
  type RestoreJobResponse,
  restoreJobResponseSchema,
  type ServerDomainSettingsResponse,
  serverDomainSettingsResponseSchema,
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
  method?: "GET" | "PATCH" | "POST";
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

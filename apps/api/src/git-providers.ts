import type {
  BitbucketProviderDetails,
  GitBranch,
  GiteaProviderDetails,
  GithubProviderDetails,
  GitlabProviderDetails,
  GitProviderResponse,
  GitRepository,
} from "@openbika/contracts";
import type { ControlPlaneDb } from "@openbika/db";
import { schema } from "@openbika/db";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { createPrivateKey, createSign } from "node:crypto";

// ---------------------------------------------------------------------------
// Row & detail types
// ---------------------------------------------------------------------------

type GitProviderRow = typeof schema.gitProviders.$inferSelect;
type GithubRow = typeof schema.githubProviders.$inferSelect;
type GitlabRow = typeof schema.gitlabProviders.$inferSelect;
type BitbucketRow = typeof schema.bitbucketProviders.$inferSelect;
type GiteaRow = typeof schema.giteaProviders.$inferSelect;

export interface LoadedGitProvider {
  parent: GitProviderRow;
  github: GithubRow | null;
  gitlab: GitlabRow | null;
  bitbucket: BitbucketRow | null;
  gitea: GiteaRow | null;
}

// ---------------------------------------------------------------------------
// Readiness checks (required credentials present per provider)
// ---------------------------------------------------------------------------

export function haveGithubRequirements(row: GithubRow | null): boolean {
  return Boolean(
    row?.appId && row.privateKey && row.installationId,
  );
}

export function haveGitlabRequirements(row: GitlabRow | null): boolean {
  return Boolean(row?.accessToken && row.refreshToken);
}

export function haveBitbucketRequirements(row: BitbucketRow | null): boolean {
  // either an API token (preferred) or legacy app password is enough to call the API
  return Boolean(row?.username && (row.apiToken ?? row.appPassword));
}

export function haveGiteaRequirements(row: GiteaRow | null): boolean {
  return Boolean(row?.clientId && row.clientSecret && row.accessToken);
}

// ---------------------------------------------------------------------------
// Serialization (strips secrets, computes isReady)
// ---------------------------------------------------------------------------

function serializeGithubDetails(
  row: GithubRow | null,
): GithubProviderDetails {
  return {
    appName: row?.appName ?? null,
    appId: row?.appId ?? null,
    clientId: row?.clientId ?? null,
    installationId: row?.installationId ?? null,
    hasClientSecret: Boolean(row?.clientSecret),
    hasPrivateKey: Boolean(row?.privateKey),
    hasWebhookSecret: Boolean(row?.webhookSecret),
  };
}

function serializeGitlabDetails(
  row: GitlabRow | null,
): GitlabProviderDetails {
  return {
    gitlabUrl: row?.gitlabUrl ?? "https://gitlab.com",
    gitlabInternalUrl: row?.gitlabInternalUrl ?? null,
    applicationId: row?.applicationId ?? null,
    redirectUri: row?.redirectUri ?? null,
    groupName: row?.groupName ?? null,
    expiresAt: row?.expiresAt ?? null,
    hasSecret: Boolean(row?.secret),
    hasAccessToken: Boolean(row?.accessToken),
    hasRefreshToken: Boolean(row?.refreshToken),
  };
}

function serializeBitbucketDetails(
  row: BitbucketRow | null,
): BitbucketProviderDetails {
  return {
    username: row?.username ?? null,
    email: row?.email ?? null,
    workspaceName: row?.workspaceName ?? null,
    hasApiToken: Boolean(row?.apiToken),
    hasAppPassword: Boolean(row?.appPassword),
  };
}

function serializeGiteaDetails(row: GiteaRow | null): GiteaProviderDetails {
  return {
    giteaUrl: row?.giteaUrl ?? "https://gitea.com",
    giteaInternalUrl: row?.giteaInternalUrl ?? null,
    redirectUri: row?.redirectUri ?? null,
    clientId: row?.clientId ?? null,
    scopes: row?.scopes ?? "repo,read:user,read:org",
    expiresAt: row?.expiresAt ?? null,
    lastAuthenticatedAt: row?.lastAuthenticatedAt?.toISOString() ?? null,
    hasClientSecret: Boolean(row?.clientSecret),
    hasAccessToken: Boolean(row?.accessToken),
    hasRefreshToken: Boolean(row?.refreshToken),
  };
}

export function serializeGitProvider(
  loaded: LoadedGitProvider,
): GitProviderResponse {
  const { parent } = loaded;
  const base = {
    id: parent.id,
    organizationId: parent.organizationId,
    name: parent.name,
    createdAt: parent.createdAt.toISOString(),
    updatedAt: parent.updatedAt.toISOString(),
  };

  switch (parent.providerType) {
    case "github":
      return {
        ...base,
        providerType: "github",
        isReady: haveGithubRequirements(loaded.github),
        details: {
          providerType: "github",
          ...serializeGithubDetails(loaded.github),
        },
      };
    case "gitlab":
      return {
        ...base,
        providerType: "gitlab",
        isReady: haveGitlabRequirements(loaded.gitlab),
        details: {
          providerType: "gitlab",
          ...serializeGitlabDetails(loaded.gitlab),
        },
      };
    case "bitbucket":
      return {
        ...base,
        providerType: "bitbucket",
        isReady: haveBitbucketRequirements(loaded.bitbucket),
        details: {
          providerType: "bitbucket",
          ...serializeBitbucketDetails(loaded.bitbucket),
        },
      };
    case "gitea":
      return {
        ...base,
        providerType: "gitea",
        isReady: haveGiteaRequirements(loaded.gitea),
        details: {
          providerType: "gitea",
          ...serializeGiteaDetails(loaded.gitea),
        },
      };
    default: {
      const exhaustive: never = parent.providerType;
      return exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Loaders / access checks
// ---------------------------------------------------------------------------

function first<T>(rows: T[]): T | undefined {
  return rows[0];
}

export async function loadGitProviderRow(
  db: ControlPlaneDb,
  gitProviderId: string,
): Promise<LoadedGitProvider> {
  const parent = first(
    await db
      .select()
      .from(schema.gitProviders)
      .where(eq(schema.gitProviders.id, gitProviderId))
      .limit(1),
  );

  if (!parent) {
    throw new HTTPException(404, { message: "Git provider not found" });
  }

  let github: GithubRow | null = null;
  let gitlab: GitlabRow | null = null;
  let bitbucket: BitbucketRow | null = null;
  let gitea: GiteaRow | null = null;

  switch (parent.providerType) {
    case "github":
      github =
        first(
          await db
            .select()
            .from(schema.githubProviders)
            .where(eq(schema.githubProviders.gitProviderId, parent.id))
            .limit(1),
        ) ?? null;
      break;
    case "gitlab":
      gitlab =
        first(
          await db
            .select()
            .from(schema.gitlabProviders)
            .where(eq(schema.gitlabProviders.gitProviderId, parent.id))
            .limit(1),
        ) ?? null;
      break;
    case "bitbucket":
      bitbucket =
        first(
          await db
            .select()
            .from(schema.bitbucketProviders)
            .where(eq(schema.bitbucketProviders.gitProviderId, parent.id))
            .limit(1),
        ) ?? null;
      break;
    case "gitea":
      gitea =
        first(
          await db
            .select()
            .from(schema.giteaProviders)
            .where(eq(schema.giteaProviders.gitProviderId, parent.id))
            .limit(1),
        ) ?? null;
      break;
    default: {
      const exhaustive: never = parent.providerType;
      throw new Error(`Unhandled provider type: ${String(exhaustive)}`);
    }
  }

  return { parent, github, gitlab, bitbucket, gitea };
}

export async function listGitProvidersForOrganization(
  db: ControlPlaneDb,
  organizationId: string,
): Promise<LoadedGitProvider[]> {
  const parents = await db
    .select()
    .from(schema.gitProviders)
    .where(eq(schema.gitProviders.organizationId, organizationId));

  if (parents.length === 0) {
    return [];
  }

  const githubMap = new Map<string, GithubRow>();
  const gitlabMap = new Map<string, GitlabRow>();
  const bitbucketMap = new Map<string, BitbucketRow>();
  const giteaMap = new Map<string, GiteaRow>();

  for (const parent of parents) {
    switch (parent.providerType) {
      case "github": {
        const row = first(
          await db
            .select()
            .from(schema.githubProviders)
            .where(eq(schema.githubProviders.gitProviderId, parent.id))
            .limit(1),
        );
        if (row) githubMap.set(parent.id, row);
        break;
      }
      case "gitlab": {
        const row = first(
          await db
            .select()
            .from(schema.gitlabProviders)
            .where(eq(schema.gitlabProviders.gitProviderId, parent.id))
            .limit(1),
        );
        if (row) gitlabMap.set(parent.id, row);
        break;
      }
      case "bitbucket": {
        const row = first(
          await db
            .select()
            .from(schema.bitbucketProviders)
            .where(eq(schema.bitbucketProviders.gitProviderId, parent.id))
            .limit(1),
        );
        if (row) bitbucketMap.set(parent.id, row);
        break;
      }
      case "gitea": {
        const row = first(
          await db
            .select()
            .from(schema.giteaProviders)
            .where(eq(schema.giteaProviders.gitProviderId, parent.id))
            .limit(1),
        );
        if (row) giteaMap.set(parent.id, row);
        break;
      }
      default: {
        const exhaustive: never = parent.providerType;
        throw new Error(`Unhandled provider type: ${String(exhaustive)}`);
      }
    }
  }

  return parents.map((parent) => ({
    parent,
    github: githubMap.get(parent.id) ?? null,
    gitlab: gitlabMap.get(parent.id) ?? null,
    bitbucket: bitbucketMap.get(parent.id) ?? null,
    gitea: giteaMap.get(parent.id) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// GitHub API helpers (manifest exchange + installation token + repo listing)
// ---------------------------------------------------------------------------

const githubApiBase = "https://api.github.com";

interface GithubManifestConversion {
  id: number;
  name: string;
  html_url: string;
  client_id: string;
  client_secret: string;
  webhook_secret: string | null;
  pem: string;
}

export async function convertGithubManifest(
  code: string,
): Promise<GithubManifestConversion> {
  const response = await fetch(
    `${githubApiBase}/app-manifests/${encodeURIComponent(code)}/conversions`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `GitHub manifest exchange failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }

  const body = (await response.json()) as GithubManifestConversion;
  return body;
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=+$/u, "")
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_");
}

function signGithubAppJwt(appId: number, privateKeyPem: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  );
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 9 * 60,
      iss: String(appId),
    }),
  );
  const signingInput = `${header}.${payload}`;
  const key = createPrivateKey({
    key: privateKeyPem,
    format: "pem",
  });
  const sign = createSign("RSA-SHA256");
  sign.update(signingInput);
  sign.end();
  const signature = base64UrlEncode(sign.sign(key));
  return `${signingInput}.${signature}`;
}

async function getGithubInstallationToken(
  github: GithubRow,
): Promise<string> {
  if (!github.appId || !github.privateKey || !github.installationId) {
    throw new HTTPException(400, {
      message: "GitHub provider missing credentials",
    });
  }
  const jwt = signGithubAppJwt(github.appId, github.privateKey);
  const response = await fetch(
    `${githubApiBase}/app/installations/${encodeURIComponent(github.installationId)}/access_tokens`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${jwt}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `GitHub installation token failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }

  const body = (await response.json()) as { token: string };
  return body.token;
}

interface GithubRepoApi {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string | null;
  private: boolean;
  html_url: string;
}

export async function listGithubRepositories(
  github: GithubRow,
): Promise<GitRepository[]> {
  const token = await getGithubInstallationToken(github);
  const repos: GitRepository[] = [];
  let page = 1;
  for (;;) {
    const url = `${githubApiBase}/installation/repositories?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HTTPException(502, {
        message: `GitHub repos list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
      });
    }
    const body = (await response.json()) as { repositories: GithubRepoApi[] };
    for (const r of body.repositories) {
      repos.push({
        id: r.id,
        name: r.name,
        fullName: r.full_name,
        owner: r.owner.login,
        defaultBranch: r.default_branch,
        private: r.private,
        url: r.html_url,
      });
    }
    if (body.repositories.length < 100) break;
    page += 1;
    if (page > 50) break;
  }
  return repos;
}

export async function listGithubBranches(
  github: GithubRow,
  owner: string,
  repo: string,
): Promise<GitBranch[]> {
  const token = await getGithubInstallationToken(github);
  const branches: GitBranch[] = [];
  let page = 1;
  for (;;) {
    const url = `${githubApiBase}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HTTPException(502, {
        message: `GitHub branches list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
      });
    }
    const body = (await response.json()) as Array<{
      name: string;
      commit?: { sha?: string | null };
    }>;
    for (const b of body) {
      branches.push({ name: b.name, commitSha: b.commit?.sha ?? null });
    }
    if (body.length < 100) break;
    page += 1;
    if (page > 50) break;
  }
  return branches;
}

// ---------------------------------------------------------------------------
// GitLab helpers (token refresh + repo/branch listing)
// ---------------------------------------------------------------------------

interface GitlabTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function gitlabBaseUrl(row: GitlabRow): string {
  return (row.gitlabInternalUrl ?? row.gitlabUrl).replace(/\/$/u, "");
}

async function refreshGitlabToken(
  db: ControlPlaneDb,
  row: GitlabRow,
): Promise<GitlabRow> {
  if (!row.refreshToken || !row.applicationId || !row.secret) {
    return row;
  }
  const params = new URLSearchParams({
    client_id: row.applicationId,
    client_secret: row.secret,
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
  });
  const response = await fetch(`${gitlabBaseUrl(row)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    return row;
  }
  const body = (await response.json()) as GitlabTokenResponse;
  const expiresAt = Math.floor(Date.now() / 1000) + body.expires_in;
  const updated = first(
    await db
      .update(schema.gitlabProviders)
      .set({
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(schema.gitlabProviders.id, row.id))
      .returning(),
  );
  return updated ?? row;
}

async function ensureGitlabValidToken(
  db: ControlPlaneDb,
  row: GitlabRow,
): Promise<GitlabRow> {
  if (!row.accessToken) {
    throw new HTTPException(400, {
      message: "GitLab provider has not been authorized",
    });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (row.expiresAt && row.expiresAt - nowSec < 60) {
    return refreshGitlabToken(db, row);
  }
  return row;
}

interface GitlabProjectApi {
  id: number;
  name: string;
  path_with_namespace: string;
  namespace: { full_path: string };
  default_branch: string | null;
  visibility: "private" | "internal" | "public";
  web_url: string;
}

export async function listGitlabRepositories(
  db: ControlPlaneDb,
  row: GitlabRow,
): Promise<GitRepository[]> {
  const fresh = await ensureGitlabValidToken(db, row);
  const url =
    `${gitlabBaseUrl(fresh)}/api/v4/projects?membership=true&per_page=100&simple=true&order_by=updated_at`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${fresh.accessToken ?? ""}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `GitLab projects list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }
  const body = (await response.json()) as GitlabProjectApi[];
  return body.map((p) => ({
    id: p.id,
    name: p.name,
    fullName: p.path_with_namespace,
    owner: p.namespace.full_path,
    defaultBranch: p.default_branch,
    private: p.visibility !== "public",
    url: p.web_url,
  }));
}

export async function listGitlabBranches(
  db: ControlPlaneDb,
  row: GitlabRow,
  projectId: string,
): Promise<GitBranch[]> {
  const fresh = await ensureGitlabValidToken(db, row);
  const url =
    `${gitlabBaseUrl(fresh)}/api/v4/projects/${encodeURIComponent(projectId)}/repository/branches?per_page=100`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${fresh.accessToken ?? ""}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `GitLab branches list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }
  const body = (await response.json()) as Array<{
    name: string;
    commit?: { id?: string | null };
  }>;
  return body.map((b) => ({ name: b.name, commitSha: b.commit?.id ?? null }));
}

// ---------------------------------------------------------------------------
// Bitbucket helpers
// ---------------------------------------------------------------------------

const bitbucketApiBase = "https://api.bitbucket.org/2.0";

function bitbucketAuthHeader(row: BitbucketRow): string {
  const secret = row.apiToken ?? row.appPassword ?? "";
  return `Basic ${Buffer.from(`${row.username ?? ""}:${secret}`).toString("base64")}`;
}

interface BitbucketRepoApi {
  uuid: string;
  name: string;
  full_name: string;
  workspace: { slug: string };
  mainbranch?: { name: string } | null;
  is_private: boolean;
  links?: { html?: { href: string | null } | null } | null;
}

export async function listBitbucketRepositories(
  row: BitbucketRow,
): Promise<GitRepository[]> {
  if (!row.username || !(row.apiToken ?? row.appPassword)) {
    throw new HTTPException(400, {
      message: "Bitbucket provider missing credentials",
    });
  }
  const workspace = row.workspaceName;
  const url = workspace
    ? `${bitbucketApiBase}/repositories/${encodeURIComponent(workspace)}?pagelen=100`
    : `${bitbucketApiBase}/repositories?role=member&pagelen=100`;
  const response = await fetch(url, {
    headers: { Authorization: bitbucketAuthHeader(row) },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `Bitbucket repos list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }
  const body = (await response.json()) as { values: BitbucketRepoApi[] };
  return body.values.map((r) => ({
    id: r.uuid,
    name: r.name,
    fullName: r.full_name,
    owner: r.workspace.slug,
    defaultBranch: r.mainbranch?.name ?? null,
    private: r.is_private,
    url: r.links?.html?.href ?? null,
  }));
}

export async function listBitbucketBranches(
  row: BitbucketRow,
  workspace: string,
  repoSlug: string,
): Promise<GitBranch[]> {
  if (!row.username || !(row.apiToken ?? row.appPassword)) {
    throw new HTTPException(400, {
      message: "Bitbucket provider missing credentials",
    });
  }
  const url = `${bitbucketApiBase}/repositories/${encodeURIComponent(workspace)}/${encodeURIComponent(repoSlug)}/refs/branches?pagelen=100`;
  const response = await fetch(url, {
    headers: { Authorization: bitbucketAuthHeader(row) },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `Bitbucket branches list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }
  const body = (await response.json()) as {
    values: Array<{ name: string; target?: { hash?: string | null } }>;
  };
  return body.values.map((b) => ({
    name: b.name,
    commitSha: b.target?.hash ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Gitea helpers
// ---------------------------------------------------------------------------

function giteaBaseUrl(row: GiteaRow): string {
  return (row.giteaInternalUrl ?? row.giteaUrl).replace(/\/$/u, "");
}

interface GiteaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

async function refreshGiteaToken(
  db: ControlPlaneDb,
  row: GiteaRow,
): Promise<GiteaRow> {
  if (!row.refreshToken || !row.clientId || !row.clientSecret) {
    return row;
  }
  const params = new URLSearchParams({
    client_id: row.clientId,
    client_secret: row.clientSecret,
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
  });
  const response = await fetch(`${giteaBaseUrl(row)}/login/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!response.ok) {
    return row;
  }
  const body = (await response.json()) as GiteaTokenResponse;
  const expiresAt = Math.floor(Date.now() / 1000) + body.expires_in;
  const updated = first(
    await db
      .update(schema.giteaProviders)
      .set({
        accessToken: body.access_token,
        refreshToken: body.refresh_token,
        expiresAt,
        lastAuthenticatedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.giteaProviders.id, row.id))
      .returning(),
  );
  return updated ?? row;
}

async function ensureGiteaValidToken(
  db: ControlPlaneDb,
  row: GiteaRow,
): Promise<GiteaRow> {
  if (!row.accessToken) {
    throw new HTTPException(400, {
      message: "Gitea provider has not been authorized",
    });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  if (row.expiresAt && row.expiresAt - nowSec < 60) {
    return refreshGiteaToken(db, row);
  }
  return row;
}

interface GiteaRepoApi {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch: string | null;
  private: boolean;
  html_url: string;
}

export async function listGiteaRepositories(
  db: ControlPlaneDb,
  row: GiteaRow,
): Promise<GitRepository[]> {
  const fresh = await ensureGiteaValidToken(db, row);
  const url = `${giteaBaseUrl(fresh)}/api/v1/repos/search?limit=50`;
  const response = await fetch(url, {
    headers: { Authorization: `token ${fresh.accessToken ?? ""}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `Gitea repos list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }
  const body = (await response.json()) as { data: GiteaRepoApi[] };
  return body.data.map((r) => ({
    id: r.id,
    name: r.name,
    fullName: r.full_name,
    owner: r.owner.login,
    defaultBranch: r.default_branch,
    private: r.private,
    url: r.html_url,
  }));
}

export async function listGiteaBranches(
  db: ControlPlaneDb,
  row: GiteaRow,
  owner: string,
  repo: string,
): Promise<GitBranch[]> {
  const fresh = await ensureGiteaValidToken(db, row);
  const url = `${giteaBaseUrl(fresh)}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?limit=100`;
  const response = await fetch(url, {
    headers: { Authorization: `token ${fresh.accessToken ?? ""}` },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HTTPException(502, {
      message: `Gitea branches list failed (HTTP ${String(response.status)}): ${text.slice(0, 200)}`,
    });
  }
  const body = (await response.json()) as Array<{
    name: string;
    commit?: { id?: string | null };
  }>;
  return body.map((b) => ({ name: b.name, commitSha: b.commit?.id ?? null }));
}

// ---------------------------------------------------------------------------
// Test-connection wrappers (single string message)
// ---------------------------------------------------------------------------

export async function testGithubConnection(
  github: GithubRow,
): Promise<{ ok: boolean; message: string }> {
  try {
    const repos = await listGithubRepositories(github);
    return { ok: true, message: `Found ${String(repos.length)} repositories` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testGitlabConnection(
  db: ControlPlaneDb,
  row: GitlabRow,
): Promise<{ ok: boolean; message: string }> {
  try {
    const repos = await listGitlabRepositories(db, row);
    return { ok: true, message: `Found ${String(repos.length)} repositories` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testBitbucketConnection(
  row: BitbucketRow,
): Promise<{ ok: boolean; message: string }> {
  try {
    const repos = await listBitbucketRepositories(row);
    return { ok: true, message: `Found ${String(repos.length)} repositories` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function testGiteaConnection(
  db: ControlPlaneDb,
  row: GiteaRow,
): Promise<{ ok: boolean; message: string }> {
  try {
    const repos = await listGiteaRepositories(db, row);
    return { ok: true, message: `Found ${String(repos.length)} repositories` };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

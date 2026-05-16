import {
  branchConnectionResponseSchema,
  branchQueryResponseSchema,
  branchSchemaResponseSchema,
  createBranchRequestSchema,
  createDatabaseRequestSchema,
  createOrganizationRequestSchema,
  createProjectRequestSchema,
  createRestoreRequestSchema,
  createWorkloadRequestSchema,
  dedupeWorkloadIngressDomains,
  executeBranchQueryRequestSchema,
  normalizeIngressFreeDnsZone,
  normalizeServerDomainHost,
  parseIngressEmbeddedPublicIpv4,
  patchServerDomainSettingsRequestSchema,
  patchWorkloadIngressDomainsRequestSchema,
  patchWorkloadEnvRequestSchema,
  pruneBlankWorkloadEnv,
  readOmitPlatformHostname,
  resolveWorkloadEffectiveListenPorts,
  suggestWorkloadEdgeHostname,
  suggestWorkloadEmbeddedIpIngressHostname,
  type BranchExpirationTtl,
  type BranchResponse,
  type BranchSchemaTableResponse,
  type DatabaseResponse,
  type ProvisionWorkloadInput,
  type ServerDomainCertificateType,
  type ServerDomainSettingsResponse,
  type WorkloadResponse,
} from "@openbika/contracts";
import { createPool, schema } from "@openbika/db";
import type { ControlPlaneDb } from "@openbika/db";
import { createId, generateULID } from "@openbika/domain";
import { readDockerContainerLogs } from "@openbika/provisioning";
import type { ApiEnv } from "@openbika/env";
import { workflowNames } from "@openbika/queue";
import { and, eq, inArray, lte } from "drizzle-orm";
import { Hono } from "hono";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { performance } from "node:perf_hooks";
import slugify from "@sindresorhus/slugify";
import type { z } from "zod";

import type { ApiBindings } from "../context.js";
import {
  startControlPlaneWorkflow,
  WorkflowDispatchError,
} from "../workflows.js";
import { applyServerDomainSettings } from "../server-domain-settings.js";

interface CreateV1RoutesOptions {
  env: ApiEnv;
}

type ApiContext = Context<ApiBindings>;

const branchQueryRowLimit = 500;
const branchStatementTimeoutMs = 5_000;
const maxSlugLength = 63;
const maxProjectSlugAttempts = 25;
const projectSlugConflictConstraint = "projects_organization_slug_idx";
const workloadNameConflictConstraint = "project_workloads_project_name_idx";
const readOnlySqlTokens = new Set(["explain", "select", "show", "with"]);
const systemSchemas = ["information_schema", "pg_catalog"];

interface BranchConnectionDetails {
  connectionString: string;
  databaseName: string;
  username: string;
}

interface BranchSchemaRow {
  columnName: string;
  dataType: string;
  defaultValue: string | null;
  estimatedRows: number | string | null;
  isNullable: boolean;
  isPrimaryKey: boolean;
  ordinalPosition: number;
  schema: string;
  tableName: string;
  tableType: string;
}

interface QueryField {
  dataTypeID: number;
  name: string;
}

interface QueryExecutionResult {
  command: string;
  fields: QueryField[];
  rowCount: number | null;
  rows: Record<string, unknown>[];
}

interface SerializableBranch {
  copyMode: (typeof schema.branches.$inferSelect)["copyMode"];
  expiresAt: Date | null;
  id: string;
  name: string;
  parentBranchId: string | null;
  status: (typeof schema.branches.$inferSelect)["status"];
}

type SerializableWorkload = typeof schema.projectWorkloads.$inferSelect;
type SerializableWebServerSettings =
  typeof schema.webServerSettings.$inferSelect;

interface WorkloadProvisioningTarget {
  id: string;
  kind: SerializableWorkload["kind"];
  observedState: unknown;
  projectId: string;
}

function first<T>(rows: T[]): T | undefined {
  return rows[0];
}

function normalizeSlug(value: string): string {
  const slug = slugify(value, {
    decamelize: false,
    lowercase: true,
    separator: "-",
  })
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, maxSlugLength)
    .replace(/-+$/g, "");

  if (slug.length >= 2) return slug;
  return `${slug || "project"}-project`.slice(0, maxSlugLength);
}

function addSlugSuffix(base: string, suffix: string): string {
  return `${base.slice(0, maxSlugLength - suffix.length)}${suffix}`;
}

function pickUniqueSlug(base: string, existingSlugs: Set<string>): string {
  if (!existingSlugs.has(base)) return base;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = addSlugSuffix(base, `-${index}`);
    if (!existingSlugs.has(candidate)) return candidate;
  }

  return addSlugSuffix(base, `-${createId("project").slice(-10)}`);
}

async function allocateProjectSlug({
  db,
  organizationId,
  requestedSlug,
}: {
  db: ControlPlaneDb;
  organizationId: string;
  requestedSlug: string;
}): Promise<string> {
  const base = normalizeSlug(requestedSlug);
  const projects = await db
    .select({ slug: schema.projects.slug })
    .from(schema.projects)
    .where(eq(schema.projects.organizationId, organizationId));

  return pickUniqueSlug(base, new Set(projects.map((project) => project.slug)));
}

function isProjectSlugConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint" in error &&
    error.code === "23505" &&
    error.constraint === projectSlugConflictConstraint
  );
}

function isWorkloadNameConflict(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint" in error &&
    error.code === "23505" &&
    error.constraint === workloadNameConflictConstraint
  );
}

function requireUser(c: ApiContext) {
  const user = c.get("user");

  if (!user) {
    throw new HTTPException(401, {
      message: "Authentication required",
    });
  }

  return user;
}

async function parseJson<TSchema extends z.ZodType>(
  c: ApiContext,
  schemaToParse: TSchema,
): Promise<z.infer<TSchema>> {
  const body = await c.req.json().catch(() => {
    throw new HTTPException(400, {
      message: "Request body must be valid JSON",
    });
  });

  const result = schemaToParse.safeParse(body);

  if (!result.success) {
    throw new HTTPException(400, {
      message: result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; "),
    });
  }

  return result.data;
}

async function assertOrganizationAccess({
  db,
  organizationId,
  requireManager = false,
  userId,
}: {
  db: ControlPlaneDb;
  organizationId: string;
  requireManager?: boolean;
  userId: string;
}) {
  const membership = first(
    await db
      .select()
      .from(schema.memberships)
      .where(
        and(
          eq(schema.memberships.organizationId, organizationId),
          eq(schema.memberships.userId, userId),
        ),
      )
      .limit(1),
  );

  if (!membership) {
    throw new HTTPException(404, {
      message: "Organization not found",
    });
  }

  if (
    requireManager &&
    membership.role !== "owner" &&
    membership.role !== "admin"
  ) {
    throw new HTTPException(403, {
      message: "Organization manager access required",
    });
  }

  return membership;
}

async function assertServerAdmin({
  db,
  userId,
}: {
  db: ControlPlaneDb;
  userId: string;
}) {
  const memberships = await db
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, userId));

  const hasAdminMembership = memberships.some(
    (membership) =>
      membership.role === "owner" || membership.role === "admin",
  );

  if (!hasAdminMembership) {
    throw new HTTPException(403, {
      message: "Server administrator access required",
    });
  }
}

async function readWebServerSettings(
  db: ControlPlaneDb,
): Promise<SerializableWebServerSettings> {
  const existing = first(
    await db.select().from(schema.webServerSettings).limit(1),
  );

  if (existing) {
    return existing;
  }

  const id = createId("web_server_settings");
  await db
    .insert(schema.webServerSettings)
    .values({ id })
    .catch(() => undefined);

  const created = first(
    await db.select().from(schema.webServerSettings).limit(1),
  );

  if (!created) {
    throw new HTTPException(500, {
      message: "Could not initialize server domain settings",
    });
  }

  return created;
}

function serializeWebServerSettings(
  settings: SerializableWebServerSettings,
): ServerDomainSettingsResponse {
  const certificateType: ServerDomainCertificateType =
    settings.certificateType === "letsencrypt" ? "letsencrypt" : "none";
  const applyStatus =
    settings.applyStatus === "applied" || settings.applyStatus === "failed"
      ? settings.applyStatus
      : "not_configured";

  return {
    applyStatus,
    certificateType,
    host: settings.host,
    https: settings.https,
    id: settings.id,
    lastAppliedAt: settings.lastAppliedAt?.toISOString() ?? null,
    lastError: settings.lastError,
    letsEncryptEmail: settings.letsEncryptEmail,
    updatedAt: settings.updatedAt.toISOString(),
  };
}

function normalizeNullableServerDomain(raw: string | null): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) {
    return null;
  }
  return normalizeServerDomainHost(trimmed);
}

function normalizeNullableEmail(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function assertProjectAccess({
  db,
  projectId,
  userId,
}: {
  db: ControlPlaneDb;
  projectId: string;
  userId: string;
}) {
  const project = first(
    await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, projectId))
      .limit(1),
  );

  if (!project) {
    throw new HTTPException(404, {
      message: "Project not found",
    });
  }

  await assertOrganizationAccess({
    db,
    organizationId: project.organizationId,
    userId,
  });

  return project;
}

async function assertDatabaseAccess({
  databaseId,
  db,
  userId,
}: {
  databaseId: string;
  db: ControlPlaneDb;
  userId: string;
}) {
  const database = first(
    await db
      .select()
      .from(schema.databaseClusters)
      .where(eq(schema.databaseClusters.id, databaseId))
      .limit(1),
  );

  if (!database) {
    throw new HTTPException(404, {
      message: "Database not found",
    });
  }

  await assertProjectAccess({
    db,
    projectId: database.projectId,
    userId,
  });

  return database;
}

async function assertWorkloadAccess({
  db,
  userId,
  workloadId,
}: {
  db: ControlPlaneDb;
  userId: string;
  workloadId: string;
}) {
  const workload = first(
    await db
      .select()
      .from(schema.projectWorkloads)
      .where(eq(schema.projectWorkloads.id, workloadId))
      .limit(1),
  );

  if (!workload) {
    throw new HTTPException(404, {
      message: "Workload not found",
    });
  }

  await assertProjectAccess({
    db,
    projectId: workload.projectId,
    userId,
  });

  return workload;
}

async function deleteExpiredBranchesForDatabase({
  databaseId,
  db,
}: {
  databaseId: string;
  db: ControlPlaneDb;
}) {
  await db
    .delete(schema.branches)
    .where(
      and(
        eq(schema.branches.clusterId, databaseId),
        lte(schema.branches.expiresAt, new Date()),
      ),
    );
}

async function assertBranchAccess({
  branchId,
  db,
  userId,
}: {
  branchId: string;
  db: ControlPlaneDb;
  userId: string;
}) {
  const branch = first(
    await db
      .select()
      .from(schema.branches)
      .where(eq(schema.branches.id, branchId))
      .limit(1),
  );

  if (!branch) {
    throw new HTTPException(404, {
      message: "Branch not found",
    });
  }

  if (branch.expiresAt && branch.expiresAt <= new Date()) {
    await db.delete(schema.branches).where(eq(schema.branches.id, branch.id));

    throw new HTTPException(404, {
      message: "Branch has expired",
    });
  }

  const database = await assertDatabaseAccess({
    databaseId: branch.clusterId,
    db,
    userId,
  });

  return { branch, database };
}

async function loadBranchEndpoint({
  branch,
  database,
  db,
}: {
  branch: typeof schema.branches.$inferSelect;
  database: typeof schema.databaseClusters.$inferSelect;
  db: ControlPlaneDb;
}) {
  const endpoint = first(
    await db
      .select()
      .from(schema.endpoints)
      .where(
        and(
          eq(schema.endpoints.clusterId, database.id),
          eq(schema.endpoints.branchId, branch.id),
        ),
      )
      .limit(1),
  );

  return (
    endpoint ??
    first(
      await db
        .select()
        .from(schema.endpoints)
        .where(eq(schema.endpoints.clusterId, database.id))
        .limit(1),
    )
  );
}

function branchExpirationFromTtl(ttl: BranchExpirationTtl | undefined) {
  if (!ttl) return null;

  const expiresAt = new Date();

  switch (ttl) {
    case "1h":
      expiresAt.setHours(expiresAt.getHours() + 1);
      return expiresAt;
    case "1d":
      expiresAt.setDate(expiresAt.getDate() + 1);
      return expiresAt;
    case "7d":
      expiresAt.setDate(expiresAt.getDate() + 7);
      return expiresAt;
    default: {
      const exhaustive: never = ttl;
      return exhaustive;
    }
  }
}

function buildBranchConnectionString({
  databaseName,
  endpoint,
  password,
  revealPassword,
  username,
}: {
  databaseName: string;
  endpoint: typeof schema.endpoints.$inferSelect;
  password: string;
  revealPassword: boolean;
  username: string;
}) {
  const renderedPassword = revealPassword ? password : "********";
  const hostname = isLocalEndpointHostname(endpoint.hostname)
    ? "localhost"
    : endpoint.hostname;
  const authority = `${encodeURIComponent(username)}:${encodeURIComponent(
    renderedPassword,
  )}@${hostname}:${endpoint.port}`;

  return `postgresql://${authority}/${encodeURIComponent(databaseName)}`;
}

function localBranchDatabaseName(branchId: string) {
  return `openbika_${localBranchToken(branchId)}`;
}

function localBranchToken(branchId: string) {
  return branchId
    .replace(/^br_/, "")
    .replaceAll("-", "")
    .slice(-12)
    .toLowerCase();
}

function legacyLocalBranchDatabaseName(branchId: string) {
  const token = branchId
    .replace(/^br_/, "")
    .replaceAll("-", "")
    .slice(0, 12)
    .toLowerCase();

  return `openbika_${token}`;
}

function localBranchDatabaseNameCandidates(branchId: string) {
  const preferred = localBranchDatabaseName(branchId);
  const legacy = legacyLocalBranchDatabaseName(branchId);

  return preferred === legacy ? [preferred] : [preferred, legacy];
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

function isLocalEndpointHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local.openbika.test")
  );
}

async function ensureLocalBranchDatabase({
  branch,
  connectionString,
}: {
  branch: typeof schema.branches.$inferSelect;
  connectionString: string;
}) {
  const databaseName = localBranchDatabaseName(branch.id);
  const token = localBranchToken(branch.id);
  const username = `${databaseName}_owner`;
  const password = `bpg_${token}`;
  const lockKey = `openbika:branch:${branch.id}`;
  const pool = createPool(connectionString);
  const client = await pool.connect();
  let acquiredLock = false;

  try {
    await client.query("select pg_advisory_lock(hashtext($1))", [lockKey]);
    acquiredLock = true;

    for (const candidate of localBranchDatabaseNameCandidates(branch.id)) {
      const existingDatabase = await client.query<{ exists: boolean }>(
        "select exists(select 1 from pg_database where datname = $1)",
        [candidate],
      );

      if (existingDatabase.rows[0]?.exists) {
        const candidateToken = candidate.replace(/^openbika_/, "");
        const candidateUsername = `${candidate}_owner`;

        return {
          databaseName: candidate,
          password: `bpg_${candidateToken}`,
          username: candidateUsername,
        };
      }
    }

    const roleExists = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_roles where rolname = $1)",
      [username],
    );

    if (!roleExists.rows[0]?.exists) {
      await client.query(
        `create role ${quoteIdentifier(username)} login password ${quoteLiteral(
          password,
        )}`,
      );
    } else {
      await client.query(
        `alter role ${quoteIdentifier(username)} login password ${quoteLiteral(
          password,
        )}`,
      );
    }

    const databaseExists = await client.query<{ exists: boolean }>(
      "select exists(select 1 from pg_database where datname = $1)",
      [databaseName],
    );

    if (!databaseExists.rows[0]?.exists) {
      await client.query(
        `create database ${quoteIdentifier(databaseName)} owner ${quoteIdentifier(
          username,
        )}`,
      );
    }
  } finally {
    if (acquiredLock) {
      await client
        .query("select pg_advisory_unlock(hashtext($1))", [lockKey])
        .catch(() => undefined);
    }
    client.release();
    await pool.end();
  }

  return {
    databaseName,
    password,
    username,
  };
}

async function resolveBranchConnectionDetails({
  branch,
  controlDatabaseUrl,
  database,
  endpoint,
}: {
  branch: typeof schema.branches.$inferSelect;
  controlDatabaseUrl: string;
  database: typeof schema.databaseClusters.$inferSelect;
  endpoint: typeof schema.endpoints.$inferSelect;
}) {
  if (isLocalEndpointHostname(endpoint.hostname)) {
    return ensureLocalBranchDatabase({
      branch,
      connectionString: controlDatabaseUrl,
    });
  }

  return {
    databaseName: database.name,
    password: `openbika_${branch.id}`,
    username: "postgres",
  };
}

async function resolveBranchRuntimeConnection({
  branch,
  controlDatabaseUrl,
  database,
  endpoint,
}: {
  branch: typeof schema.branches.$inferSelect;
  controlDatabaseUrl: string;
  database: typeof schema.databaseClusters.$inferSelect;
  endpoint: typeof schema.endpoints.$inferSelect;
}): Promise<BranchConnectionDetails> {
  const connectionDetails = await resolveBranchConnectionDetails({
    branch,
    controlDatabaseUrl,
    database,
    endpoint,
  });

  return {
    connectionString: buildBranchConnectionString({
      databaseName: connectionDetails.databaseName,
      endpoint,
      password: connectionDetails.password,
      revealPassword: true,
      username: connectionDetails.username,
    }),
    databaseName: connectionDetails.databaseName,
    username: connectionDetails.username,
  };
}

async function loadBranchSchema({
  branchId,
  connectionString,
}: {
  branchId: string;
  connectionString: string;
}) {
  const pool = createPool(connectionString);

  try {
    const result = await pool.query<BranchSchemaRow>(
      `
        select
          c.table_schema as "schema",
          c.table_name as "tableName",
          t.table_type as "tableType",
          c.column_name as "columnName",
          c.ordinal_position as "ordinalPosition",
          coalesce(format_type(a.atttypid, a.atttypmod), c.data_type) as "dataType",
          c.is_nullable = 'YES' as "isNullable",
          c.column_default as "defaultValue",
          coalesce(pk.is_primary_key, false) as "isPrimaryKey",
          case
            when cls.reltuples >= 0 then cls.reltuples::double precision
            else null
          end as "estimatedRows"
        from information_schema.columns c
        join information_schema.tables t
          on t.table_schema = c.table_schema
          and t.table_name = c.table_name
        left join pg_namespace ns
          on ns.nspname = c.table_schema
        left join pg_class cls
          on cls.relnamespace = ns.oid
          and cls.relname = c.table_name
        left join pg_attribute a
          on a.attrelid = cls.oid
          and a.attname = c.column_name
          and a.attnum > 0
          and not a.attisdropped
        left join (
          select
            kcu.table_schema,
            kcu.table_name,
            kcu.column_name,
            true as is_primary_key
          from information_schema.table_constraints tc
          join information_schema.key_column_usage kcu
            on kcu.constraint_name = tc.constraint_name
            and kcu.constraint_schema = tc.constraint_schema
            and kcu.table_schema = tc.table_schema
            and kcu.table_name = tc.table_name
          where tc.constraint_type = 'PRIMARY KEY'
        ) pk
          on pk.table_schema = c.table_schema
          and pk.table_name = c.table_name
          and pk.column_name = c.column_name
        where c.table_schema <> all($1)
          and c.table_schema not like 'pg_toast%'
        order by c.table_schema, c.table_name, c.ordinal_position
      `,
      [systemSchemas],
    );
    const tableByKey = new Map<string, BranchSchemaTableResponse>();

    for (const row of result.rows) {
      const key = `${row.schema}.${row.tableName}`;
      const existing = tableByKey.get(key);
      const estimatedRows =
        row.estimatedRows === null
          ? null
          : Math.max(0, Math.floor(Number(row.estimatedRows)));
      const table =
        existing ??
        ({
          columns: [],
          estimatedRows,
          name: row.tableName,
          schema: row.schema,
          type: row.tableType,
        } satisfies BranchSchemaTableResponse);

      table.columns.push({
        dataType: row.dataType,
        defaultValue: row.defaultValue,
        isNullable: row.isNullable,
        isPrimaryKey: row.isPrimaryKey,
        name: row.columnName,
        ordinalPosition: row.ordinalPosition,
      });
      tableByKey.set(key, table);
    }

    return branchSchemaResponseSchema.parse({
      branchId,
      tables: [...tableByKey.values()],
    });
  } finally {
    await pool.end();
  }
}

function readFirstSqlToken(sql: string) {
  const withoutLeadingComments = sql
    .replace(/^\s*(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/\s*)*/u, "")
    .trimStart();
  const match = /^[a-z]+/iu.exec(withoutLeadingComments);

  return match?.[0].toLowerCase() ?? "";
}

function isReadOnlySql(sql: string) {
  return readOnlySqlTokens.has(readFirstSqlToken(sql));
}

function normalizeQueryResult(
  result: QueryExecutionResult | QueryExecutionResult[],
) {
  return Array.isArray(result) ? (result.at(-1) ?? null) : result;
}

async function executeBranchSql({
  connectionString,
  readOnly,
  sql,
}: {
  connectionString: string;
  readOnly: boolean;
  sql: string;
}) {
  if (readOnly && !isReadOnlySql(sql)) {
    throw new HTTPException(400, {
      message:
        "Read-only mode only allows SELECT, WITH, EXPLAIN, and SHOW statements",
    });
  }

  const pool = createPool(connectionString);
  const client = await pool.connect();
  const startedAt = performance.now();

  try {
    await client.query(readOnly ? "begin read only" : "begin");
    await client.query("select set_config('statement_timeout', $1, true)", [
      branchStatementTimeoutMs.toString(),
    ]);

    const rawResult = (await client.query(sql)) as
      | QueryExecutionResult
      | QueryExecutionResult[];
    const result = normalizeQueryResult(rawResult);

    await client.query("commit");

    if (!result) {
      return branchQueryResponseSchema.parse({
        columns: [],
        command: "EMPTY",
        durationMs: Math.round(performance.now() - startedAt),
        readOnly,
        rowCount: 0,
        rows: [],
        truncated: false,
      });
    }

    const rows = result.rows.slice(0, branchQueryRowLimit);

    return branchQueryResponseSchema.parse({
      columns: result.fields.map((field) => ({
        dataTypeId: field.dataTypeID,
        name: field.name,
      })),
      command: result.command,
      durationMs: Math.round(performance.now() - startedAt),
      readOnly,
      rowCount: result.rowCount ?? result.rows.length,
      rows,
      truncated: result.rows.length > rows.length,
    });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function serializeDatabase(
  db: ControlPlaneDb,
  database: typeof schema.databaseClusters.$inferSelect,
): Promise<DatabaseResponse> {
  await deleteExpiredBranchesForDatabase({
    databaseId: database.id,
    db,
  });

  const branches = await db
    .select()
    .from(schema.branches)
    .where(eq(schema.branches.clusterId, database.id));
  const endpoint = first(
    await db
      .select()
      .from(schema.endpoints)
      .where(eq(schema.endpoints.clusterId, database.id))
      .limit(1),
  );

  return {
    branches: branches.map(serializeBranch),
    endpoint: endpoint
      ? {
          hostname: endpoint.hostname,
          id: endpoint.id,
          poolerMode: endpoint.poolerMode,
          port: endpoint.port,
        }
      : null,
    id: database.id,
    name: database.name,
    observedState: database.observedState,
    postgresVersion: database.postgresVersion,
    projectId: database.projectId,
    status: database.status,
  };
}

function serializeBranch(branch: SerializableBranch): BranchResponse {
  return {
    copyMode: branch.copyMode,
    expiresAt: serializeNullableDate(branch.expiresAt),
    id: branch.id,
    name: branch.name,
    parentBranchId: branch.parentBranchId,
    status: branch.status,
  };
}

function serializeNullableDate(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

function readJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

type CreateWorkloadBody = z.infer<typeof createWorkloadRequestSchema>;

function buildWorkloadDesiredState(
  input: CreateWorkloadBody,
): Record<string, unknown> {
  if (input.kind === "container") {
    const out: Record<string, unknown> = {
      build: input.build,
      image: input.image,
      ports: input.ports,
    };
    if (input.env !== undefined) {
      const env = pruneBlankWorkloadEnv(input.env);
      if (Object.keys(env).length > 0) {
        out.env = env;
      }
    }
    return out;
  }

  const out: Record<string, unknown> = {
    entrypoint: input.entrypoint,
    runtime: input.runtime,
    source: input.source,
  };
  if (input.env !== undefined) {
    const env = pruneBlankWorkloadEnv(input.env);
    if (Object.keys(env).length > 0) {
      out.env = env;
    }
  }
  return out;
}

function serializeWorkload(
  workload: SerializableWorkload,
  apiEnv: ApiEnv,
): WorkloadResponse {
  type EdgeOut = NonNullable<WorkloadResponse["edge"]>;

  const edgeDomainHint =
    apiEnv.OPENBIKA_EDGE_PUBLIC_BASE_DOMAIN?.trim() ||
    apiEnv.OPENBIKA_PUBLIC_BASE_DOMAIN?.trim();

  const rawFreeZone = apiEnv.OPENBIKA_INGRESS_FREE_DNS_ZONE?.trim();
  const freeDnsZone =
    rawFreeZone !== undefined && rawFreeZone.length > 0
      ? normalizeIngressFreeDnsZone(rawFreeZone)
      : null;
  const embeddedIp = parseIngressEmbeddedPublicIpv4(
    apiEnv.OPENBIKA_INGRESS_PUBLIC_IPV4 ?? "",
  );

  let edge: EdgeOut | undefined;

  const hasNipOrSslip = freeDnsZone !== null && embeddedIp !== null;
  if (hasNipOrSslip) {
    edge = {
      embeddedPublicIpv4: embeddedIp,
      freeDnsZone,
      publicBaseDomain: freeDnsZone,
      suggestedDefaultHostname: suggestWorkloadEmbeddedIpIngressHostname(
        workload.id,
        embeddedIp,
        freeDnsZone,
      ),
    };
  } else if (edgeDomainHint !== undefined && edgeDomainHint !== "") {
    const publicBaseDomain = edgeDomainHint
      .toLowerCase()
      .replace(/^\.+|\.+$/g, "");
    edge = {
      publicBaseDomain,
      suggestedDefaultHostname: suggestWorkloadEdgeHostname(
        workload.id,
        publicBaseDomain,
      ),
    };
  }

  return {
    createdAt: workload.createdAt.toISOString(),
    desiredState: workload.desiredState,
    ...(edge !== undefined ? { edge } : {}),
    id: workload.id,
    kind: workload.kind,
    name: workload.name,
    observedState: workload.observedState,
    projectId: workload.projectId,
    status: workload.status,
    updatedAt: workload.updatedAt.toISOString(),
  };
}

async function startWorkloadProvisioning({
  desiredState,
  db,
  env,
  failureMessage,
  workload,
  workflowId,
}: {
  desiredState: Record<string, unknown>;
  db: ControlPlaneDb;
  env: ApiEnv;
  failureMessage: string;
  workload: WorkloadProvisioningTarget;
  workflowId: string;
}) {
  const payload: ProvisionWorkloadInput = {
    desiredState,
    kind: workload.kind,
    projectId: workload.projectId,
    provider: "local",
    workloadId: workload.id,
  };

  try {
    await startControlPlaneWorkflow({
      env,
      name: workflowNames.provisionWorkload,
      payload,
      workflowId,
    });
  } catch (error) {
    if (!(error instanceof WorkflowDispatchError)) {
      throw error;
    }

    await db
      .update(schema.projectWorkloads)
      .set({
        observedState: {
          ...readJsonRecord(workload.observedState),
          error: "Provisioning workflow could not start",
        },
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(schema.projectWorkloads.id, workload.id))
      .catch(() => undefined);

    throw new HTTPException(503, {
      message: failureMessage,
    });
  }
}

export function createV1Routes({ env }: CreateV1RoutesOptions) {
  const routes = new Hono<ApiBindings>();

  routes.get("/settings/server-domain", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");

    await assertServerAdmin({ db, userId: user.id });

    const settings = await readWebServerSettings(db);
    return c.json({
      settings: serializeWebServerSettings(settings),
    });
  });

  routes.patch("/settings/server-domain", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");

    await assertServerAdmin({ db, userId: user.id });

    const body = await parseJson(c, patchServerDomainSettingsRequestSchema);
    const current = await readWebServerSettings(db);

    let nextHost: string | null;
    try {
      nextHost =
        body.host === undefined
          ? current.host
          : normalizeNullableServerDomain(body.host);
    } catch (error) {
      throw new HTTPException(400, {
        message:
          error instanceof Error ? error.message : "Invalid server domain",
      });
    }

    const nextHttps = body.https ?? current.https;
    const nextCertificateType: ServerDomainCertificateType = nextHttps
      ? (body.certificateType ?? "letsencrypt")
      : "none";
    const nextLetsEncryptEmail =
      body.letsEncryptEmail === undefined
        ? current.letsEncryptEmail
        : normalizeNullableEmail(body.letsEncryptEmail);

    if (nextHttps && !nextHost) {
      throw new HTTPException(400, {
        message: "Server domain is required when automatic SSL is enabled",
      });
    }

    if (nextHttps && nextCertificateType === "letsencrypt") {
      if (!nextLetsEncryptEmail) {
        throw new HTTPException(400, {
          message:
            "Let's Encrypt email is required when automatic SSL is enabled",
        });
      }
    }

    const baseUpdate = {
      applyStatus: "not_configured",
      certificateType: nextCertificateType,
      host: nextHost,
      https: nextHttps,
      lastError: null,
      letsEncryptEmail: nextLetsEncryptEmail,
      updatedAt: new Date(),
    };

    const saved = first(
      await db
        .update(schema.webServerSettings)
        .set(baseUpdate)
        .where(eq(schema.webServerSettings.id, current.id))
        .returning(),
    );

    if (!saved) {
      throw new HTTPException(500, {
        message: "Could not save server domain settings",
      });
    }

    try {
      await applyServerDomainSettings({
        certificateType: nextCertificateType,
        env,
        host: nextHost,
        https: nextHttps,
        letsEncryptEmail: nextLetsEncryptEmail,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not apply server domain settings";

      await db
        .update(schema.webServerSettings)
        .set({
          applyStatus: "failed",
          lastError: message,
          updatedAt: new Date(),
        })
        .where(eq(schema.webServerSettings.id, current.id));

      throw new HTTPException(500, { message });
    }

    const applyStatus = nextHost ? "applied" : "not_configured";
    const applied = first(
      await db
        .update(schema.webServerSettings)
        .set({
          applyStatus,
          lastAppliedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(schema.webServerSettings.id, current.id))
        .returning(),
    );

    return c.json({
      settings: serializeWebServerSettings(applied ?? saved),
    });
  });

  routes.get("/organizations", async (c) => {
    const user = requireUser(c);
    const organizations = await c
      .get("db")
      .select({
        id: schema.organizations.id,
        name: schema.organizations.name,
        role: schema.memberships.role,
        slug: schema.organizations.slug,
      })
      .from(schema.memberships)
      .innerJoin(
        schema.organizations,
        eq(schema.organizations.id, schema.memberships.organizationId),
      )
      .where(eq(schema.memberships.userId, user.id));

    return c.json({
      organizations,
    });
  });

  routes.post("/organizations", async (c) => {
    const user = requireUser(c);
    const input = await parseJson(c, createOrganizationRequestSchema);
    const db = c.get("db");
    const organization = {
      id: createId("organization"),
      name: input.name,
      slug: input.slug,
    };

    await db.transaction(async (tx) => {
      await tx.insert(schema.organizations).values(organization);
      await tx.insert(schema.memberships).values({
        id: createId("membership"),
        organizationId: organization.id,
        role: "owner",
        userId: user.id,
      });
    });

    return c.json(
      {
        organization: {
          ...organization,
          role: "owner",
        },
      },
      201,
    );
  });

  routes.get("/projects", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const organizationId = c.req.query("organizationId");

    if (organizationId) {
      await assertOrganizationAccess({
        db,
        organizationId,
        userId: user.id,
      });

      const projects = await db
        .select({
          id: schema.projects.id,
          name: schema.projects.name,
          organizationId: schema.projects.organizationId,
          slug: schema.projects.slug,
        })
        .from(schema.projects)
        .where(eq(schema.projects.organizationId, organizationId));

      return c.json({
        projects,
      });
    }

    const projects = await db
      .select({
        id: schema.projects.id,
        name: schema.projects.name,
        organizationId: schema.projects.organizationId,
        slug: schema.projects.slug,
      })
      .from(schema.projects)
      .innerJoin(
        schema.memberships,
        eq(schema.memberships.organizationId, schema.projects.organizationId),
      )
      .where(eq(schema.memberships.userId, user.id));

    return c.json({
      projects,
    });
  });

  routes.get("/projects/summaries", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const organizationId = c.req.query("organizationId");

    if (!organizationId) {
      throw new HTTPException(400, {
        message: "organizationId query parameter is required",
      });
    }

    await assertOrganizationAccess({
      db,
      organizationId,
      userId: user.id,
    });

    const projects = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.organizationId, organizationId));

    if (projects.length === 0) {
      return c.json({ summaries: [] });
    }

    const projectIds = projects.map((project) => project.id);
    const databases = await db
      .select({
        id: schema.databaseClusters.id,
        projectId: schema.databaseClusters.projectId,
        status: schema.databaseClusters.status,
      })
      .from(schema.databaseClusters)
      .where(inArray(schema.databaseClusters.projectId, projectIds));
    const workloads = await db
      .select({
        projectId: schema.projectWorkloads.projectId,
        status: schema.projectWorkloads.status,
      })
      .from(schema.projectWorkloads)
      .where(inArray(schema.projectWorkloads.projectId, projectIds));
    const databaseIds = databases.map((database) => database.id);
    const branchRows = databaseIds.length
      ? await db
          .select({
            clusterId: schema.branches.clusterId,
            status: schema.branches.status,
          })
          .from(schema.branches)
          .where(inArray(schema.branches.clusterId, databaseIds))
      : [];

    const databasesByProject = new Map<
      string,
      Array<(typeof databases)[number]>
    >();
    for (const database of databases) {
      const list = databasesByProject.get(database.projectId) ?? [];
      list.push(database);
      databasesByProject.set(database.projectId, list);
    }

    const workloadsByProject = new Map<
      string,
      Array<(typeof workloads)[number]>
    >();
    for (const workload of workloads) {
      const list = workloadsByProject.get(workload.projectId) ?? [];
      list.push(workload);
      workloadsByProject.set(workload.projectId, list);
    }

    const branchesByDatabase = new Map<
      string,
      Array<(typeof branchRows)[number]>
    >();
    for (const branch of branchRows) {
      const list = branchesByDatabase.get(branch.clusterId) ?? [];
      list.push(branch);
      branchesByDatabase.set(branch.clusterId, list);
    }

    const summaries = projects.map((project) => {
      const projectDatabases = databasesByProject.get(project.id) ?? [];
      const projectWorkloads = workloadsByProject.get(project.id) ?? [];
      const projectBranches = projectDatabases.flatMap(
        (database) => branchesByDatabase.get(database.id) ?? [],
      );

      const isProvisioning =
        projectDatabases.some(
          (database) =>
            database.status === "requested" ||
            database.status === "provisioning",
        ) ||
        projectWorkloads.some(
          (workload) =>
            workload.status === "requested" ||
            workload.status === "provisioning",
        ) ||
        projectBranches.some(
          (branch) =>
            branch.status === "requested" || branch.status === "creating",
        );

      const hasFailure =
        projectDatabases.some((database) => database.status === "failed") ||
        projectWorkloads.some((workload) => workload.status === "failed") ||
        projectBranches.some((branch) => branch.status === "failed");

      return {
        branchCount: projectBranches.length,
        databaseCount: projectDatabases.length,
        hasFailure,
        id: project.id,
        isProvisioning,
        name: project.name,
        organizationId: project.organizationId,
        slug: project.slug,
        workloadCount: projectWorkloads.length,
      };
    });

    return c.json({ summaries });
  });

  routes.post("/projects", async (c) => {
    const user = requireUser(c);
    const input = await parseJson(c, createProjectRequestSchema);
    const db = c.get("db");

    await assertOrganizationAccess({
      db,
      organizationId: input.organizationId,
      requireManager: true,
      userId: user.id,
    });

    for (let attempt = 0; attempt < maxProjectSlugAttempts; attempt += 1) {
      const project = {
        id: createId("project"),
        name: input.name,
        organizationId: input.organizationId,
        slug: await allocateProjectSlug({
          db,
          organizationId: input.organizationId,
          requestedSlug: input.slug,
        }),
      };

      try {
        await db.insert(schema.projects).values(project);

        return c.json(
          {
            project,
          },
          201,
        );
      } catch (error) {
        if (!isProjectSlugConflict(error)) {
          throw error;
        }
      }
    }

    throw new HTTPException(409, {
      message: "Could not allocate a unique project slug. Please try again.",
    });
  });

  routes.get("/projects/:projectId/databases", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const project = await assertProjectAccess({
      db,
      projectId: c.req.param("projectId"),
      userId: user.id,
    });
    const databases = await db
      .select()
      .from(schema.databaseClusters)
      .where(eq(schema.databaseClusters.projectId, project.id));

    return c.json({
      databases: await Promise.all(
        databases.map((database) => serializeDatabase(db, database)),
      ),
    });
  });

  routes.post("/projects/:projectId/databases", async (c) => {
    const user = requireUser(c);
    const input = await parseJson(c, createDatabaseRequestSchema);
    const db = c.get("db");
    const project = await assertProjectAccess({
      db,
      projectId: c.req.param("projectId"),
      userId: user.id,
    });

    const database = {
      id: createId("database_cluster"),
      name: input.name,
      postgresVersion: input.postgresVersion,
      projectId: project.id,
      status: "requested" as const,
    };

    await db.transaction(async (tx) => {
      await tx.insert(schema.databaseClusters).values(database);
      await tx.insert(schema.branches).values({
        clusterId: database.id,
        copyMode: "schema_only",
        expiresAt: null,
        id: createId("branch"),
        name: "main",
        status: "creating",
      });
    });

    try {
      await startControlPlaneWorkflow({
        env,
        name: workflowNames.provisionCluster,
        payload: {
          clusterId: database.id,
          postgresVersion: database.postgresVersion,
          projectId: database.projectId,
          provider: "local",
        },
        workflowId: `provision-${database.id}`,
      });
    } catch (error) {
      if (error instanceof WorkflowDispatchError) {
        await db
          .update(schema.databaseClusters)
          .set({
            observedState: { error: "Provisioning workflow could not start" },
            status: "failed",
            updatedAt: new Date(),
          })
          .where(eq(schema.databaseClusters.id, database.id))
          .catch(() => undefined);
        await db
          .update(schema.branches)
          .set({ status: "failed", updatedAt: new Date() })
          .where(eq(schema.branches.clusterId, database.id))
          .catch(() => undefined);

        throw new HTTPException(503, {
          message:
            "Database was recorded, but the provisioning workflow could not be started",
        });
      }

      throw error;
    }

    const createdDatabase = first(
      await db
        .select()
        .from(schema.databaseClusters)
        .where(eq(schema.databaseClusters.id, database.id))
        .limit(1),
    );

    if (!createdDatabase) {
      throw new HTTPException(500, {
        message: "Database metadata could not be loaded",
      });
    }

    return c.json(
      {
        database: await serializeDatabase(db, createdDatabase),
      },
      201,
    );
  });

  routes.get("/projects/:projectId/workloads", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const project = await assertProjectAccess({
      db,
      projectId: c.req.param("projectId"),
      userId: user.id,
    });
    const workloads = await db
      .select()
      .from(schema.projectWorkloads)
      .where(eq(schema.projectWorkloads.projectId, project.id));

    return c.json({
      workloads: workloads.map((w) => serializeWorkload(w, env)),
    });
  });

  routes.post("/projects/:projectId/workloads", async (c) => {
    const user = requireUser(c);
    const input = await parseJson(c, createWorkloadRequestSchema);
    const db = c.get("db");
    const project = await assertProjectAccess({
      db,
      projectId: c.req.param("projectId"),
      userId: user.id,
    });

    const workload = {
      desiredState: buildWorkloadDesiredState(input),
      id: createId("project_workload"),
      kind: input.kind,
      name: input.name,
      projectId: project.id,
      status: "requested" as const,
    };

    try {
      await db.insert(schema.projectWorkloads).values(workload);
    } catch (error) {
      if (!isWorkloadNameConflict(error)) {
        throw error;
      }

      throw new HTTPException(409, {
        message: "A workload with this name already exists in the project",
      });
    }

    await startWorkloadProvisioning({
      db,
      desiredState: workload.desiredState,
      env,
      failureMessage:
        "Workload was recorded, but the provisioning workflow could not be started",
      workload: { ...workload, observedState: {} },
      workflowId: `provision-workload-${workload.id}`,
    });

    const created = first(
      await db
        .select()
        .from(schema.projectWorkloads)
        .where(eq(schema.projectWorkloads.id, workload.id))
        .limit(1),
    );

    if (!created) {
      throw new HTTPException(500, {
        message: "Workload metadata could not be loaded",
      });
    }

    return c.json(
      {
        workload: serializeWorkload(created, env),
      },
      201,
    );
  });

  routes.get("/workloads/:workloadId", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const workload = await assertWorkloadAccess({
      db,
      userId: user.id,
      workloadId: c.req.param("workloadId"),
    });

    return c.json({
      workload: serializeWorkload(workload, env),
    });
  });

  routes.get("/workloads/:workloadId/runtime-logs", async (c) => {
    const user = requireUser(c);
    const workload = await assertWorkloadAccess({
      db: c.get("db"),
      userId: user.id,
      workloadId: c.req.param("workloadId"),
    });

    if (workload.kind !== "container" && workload.kind !== "function") {
      throw new HTTPException(400, {
        message: "Runtime logs apply only to container and function workloads.",
      });
    }

    const tailRaw = c.req.query("tail");
    const parsed = tailRaw !== undefined ? Number.parseInt(tailRaw, 10) : NaN;
    const tail = Number.isFinite(parsed)
      ? Math.min(10_000, Math.max(1, parsed))
      : 500;

    const observed =
      typeof workload.observedState === "object" &&
      workload.observedState !== null &&
      !Array.isArray(workload.observedState)
        ? (workload.observedState as Record<string, unknown>)
        : {};

    const containerRef =
      typeof observed.dockerContainerId === "string" &&
      observed.dockerContainerId.length > 0
        ? observed.dockerContainerId
        : typeof observed.dockerContainerName === "string" &&
            observed.dockerContainerName.length > 0
          ? observed.dockerContainerName
          : null;

    if (containerRef === null) {
      throw new HTTPException(404, {
        message:
          "No Docker container is recorded yet. Re-run provisioning after the worker picks up changes.",
      });
    }

    try {
      const logs = await readDockerContainerLogs(containerRef, tail);
      return c.json({ logs });
    } catch (error) {
      throw new HTTPException(503, {
        message:
          error instanceof Error
            ? `Could not read Docker logs: ${error.message}`
            : "Could not read Docker logs",
      });
    }
  });

  routes.patch("/workloads/:workloadId", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const workload = await assertWorkloadAccess({
      db,
      userId: user.id,
      workloadId: c.req.param("workloadId"),
    });

    if (workload.kind !== "container" && workload.kind !== "function") {
      throw new HTTPException(400, {
        message:
          "Environment variables are only supported for container and function workloads.",
      });
    }

    const input = await parseJson(c, patchWorkloadEnvRequestSchema);

    const mergedDesired: Record<string, unknown> = {
      ...readJsonRecord(workload.desiredState),
      env: pruneBlankWorkloadEnv(input.env),
    };

    await db
      .update(schema.projectWorkloads)
      .set({
        desiredState: mergedDesired,
        status: "provisioning",
        updatedAt: new Date(),
      })
      .where(eq(schema.projectWorkloads.id, workload.id));

    await startWorkloadProvisioning({
      db,
      desiredState: mergedDesired,
      env,
      failureMessage:
        "Workload was updated, but the provisioning workflow could not be started.",
      workload,
      workflowId: `provision-workload-${workload.id}-redeploy-${generateULID()}`,
    });

    const updatedRow = first(
      await db
        .select()
        .from(schema.projectWorkloads)
        .where(eq(schema.projectWorkloads.id, workload.id))
        .limit(1),
    );

    if (!updatedRow) {
      throw new HTTPException(500, {
        message: "Workload metadata could not be loaded",
      });
    }

    return c.json({
      workload: serializeWorkload(updatedRow, env),
    });
  });

  routes.patch("/workloads/:workloadId/domains", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const workload = await assertWorkloadAccess({
      db,
      userId: user.id,
      workloadId: c.req.param("workloadId"),
    });

    if (workload.kind !== "container" && workload.kind !== "function") {
      throw new HTTPException(400, {
        message:
          "Ingress domains apply only to container and function workloads.",
      });
    }

    const body = await parseJson(c, patchWorkloadIngressDomainsRequestSchema);

    let normalized;
    try {
      normalized = dedupeWorkloadIngressDomains(body.domains);
    } catch (err) {
      throw new HTTPException(400, {
        message:
          err instanceof Error
            ? err.message
            : "Invalid ingress domains payload",
      });
    }

    const prevDesired = readJsonRecord(workload.desiredState);

    const kindKey: "container" | "function" =
      workload.kind === "function" ? "function" : "container";
    const allowedPorts = resolveWorkloadEffectiveListenPorts(
      prevDesired,
      kindKey,
    );
    const allowedSet = new Set(allowedPorts);

    if (normalized.length > 0) {
      if (kindKey === "container" && allowedSet.size === 0) {
        throw new HTTPException(400, {
          message:
            "This container workload has no declared publish ports yet. Set `ports` before attaching ingress domains.",
        });
      }
      for (const d of normalized) {
        if (!allowedSet.has(d.containerPort)) {
          throw new HTTPException(400, {
            message: `Container listen port ${String(d.containerPort)} is not declared on this workload. Declared ports: ${Array.from(allowedSet).join(", ") || "none"}.`,
          });
        }
      }
    }

    const omitProvided = body.omitPlatformHostname;
    const prevOmit = readOmitPlatformHostname(prevDesired);
    const omitPlatformHostname =
      omitProvided !== undefined ? omitProvided : prevOmit;

    const mergedDesired: Record<string, unknown> = { ...prevDesired };
    if (normalized.length === 0 && !omitPlatformHostname) {
      delete mergedDesired.ingress;
    } else {
      const ingressPayload: Record<string, unknown> = {};
      if (normalized.length > 0) {
        ingressPayload.domains = normalized.map((row) => ({
          containerPort: row.containerPort,
          hostname: row.hostname,
          https: row.https,
          path: row.path,
        }));
      }
      if (omitPlatformHostname) {
        ingressPayload.omitPlatformHostname = true;
      }
      mergedDesired.ingress = ingressPayload;
    }

    await db
      .update(schema.projectWorkloads)
      .set({
        desiredState: mergedDesired,
        status: "provisioning",
        updatedAt: new Date(),
      })
      .where(eq(schema.projectWorkloads.id, workload.id));

    await startWorkloadProvisioning({
      db,
      desiredState: mergedDesired,
      env,
      failureMessage:
        "Domains were recorded, but the provisioning workflow could not be started.",
      workload,
      workflowId: `provision-workload-${workload.id}-domains-${generateULID()}`,
    });

    const updatedRow = first(
      await db
        .select()
        .from(schema.projectWorkloads)
        .where(eq(schema.projectWorkloads.id, workload.id))
        .limit(1),
    );

    if (!updatedRow) {
      throw new HTTPException(500, {
        message: "Workload metadata could not be loaded",
      });
    }

    return c.json({
      workload: serializeWorkload(updatedRow, env),
    });
  });

  routes.post("/workloads/:workloadId/rebuild", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const workload = await assertWorkloadAccess({
      db,
      userId: user.id,
      workloadId: c.req.param("workloadId"),
    });

    if (workload.kind !== "container" && workload.kind !== "function") {
      throw new HTTPException(400, {
        message:
          "Rebuild is only supported for container and function workloads.",
      });
    }

    const desiredPayload: Record<string, unknown> = {
      ...readJsonRecord(workload.desiredState),
    };

    await db
      .update(schema.projectWorkloads)
      .set({
        status: "provisioning",
        updatedAt: new Date(),
      })
      .where(eq(schema.projectWorkloads.id, workload.id));

    await startWorkloadProvisioning({
      db,
      desiredState: desiredPayload,
      env,
      failureMessage:
        "Rebuild was requested, but the provisioning workflow could not be started.",
      workload,
      workflowId: `provision-workload-${workload.id}-rebuild-${generateULID()}`,
    });

    const updatedRow = first(
      await db
        .select()
        .from(schema.projectWorkloads)
        .where(eq(schema.projectWorkloads.id, workload.id))
        .limit(1),
    );

    if (!updatedRow) {
      throw new HTTPException(500, {
        message: "Workload metadata could not be loaded",
      });
    }

    return c.json({
      workload: serializeWorkload(updatedRow, env),
    });
  });

  routes.get("/databases/:databaseId", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const database = await assertDatabaseAccess({
      databaseId: c.req.param("databaseId"),
      db,
      userId: user.id,
    });

    return c.json({
      database: await serializeDatabase(db, database),
    });
  });

  routes.get("/branches/:branchId/connection", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const { branch, database } = await assertBranchAccess({
      branchId: c.req.param("branchId"),
      db,
      userId: user.id,
    });
    const fallbackEndpoint = await loadBranchEndpoint({
      branch,
      database,
      db,
    });

    if (!fallbackEndpoint) {
      throw new HTTPException(404, {
        message: "No endpoint is available for this branch",
      });
    }

    const connectionDetails = await resolveBranchConnectionDetails({
      branch,
      controlDatabaseUrl: env.DATABASE_URL,
      database,
      endpoint: fallbackEndpoint,
    });
    const connection = branchConnectionResponseSchema.parse({
      branchId: branch.id,
      connectionString: buildBranchConnectionString({
        databaseName: connectionDetails.databaseName,
        endpoint: fallbackEndpoint,
        password: connectionDetails.password,
        revealPassword: true,
        username: connectionDetails.username,
      }),
      databaseId: database.id,
      databaseName: connectionDetails.databaseName,
      maskedConnectionString: buildBranchConnectionString({
        databaseName: connectionDetails.databaseName,
        endpoint: fallbackEndpoint,
        password: connectionDetails.password,
        revealPassword: false,
        username: connectionDetails.username,
      }),
      username: connectionDetails.username,
    });

    return c.json({ connection });
  });

  routes.get("/branches/:branchId/schema", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const { branch, database } = await assertBranchAccess({
      branchId: c.req.param("branchId"),
      db,
      userId: user.id,
    });
    const endpoint = await loadBranchEndpoint({
      branch,
      database,
      db,
    });

    if (!endpoint) {
      throw new HTTPException(404, {
        message: "No endpoint is available for this branch",
      });
    }

    const connection = await resolveBranchRuntimeConnection({
      branch,
      controlDatabaseUrl: env.DATABASE_URL,
      database,
      endpoint,
    });

    return c.json({
      schema: await loadBranchSchema({
        branchId: branch.id,
        connectionString: connection.connectionString,
      }),
    });
  });

  routes.post("/branches/:branchId/query", async (c) => {
    const user = requireUser(c);
    const input = await parseJson(c, executeBranchQueryRequestSchema);
    const db = c.get("db");
    const { branch, database } = await assertBranchAccess({
      branchId: c.req.param("branchId"),
      db,
      userId: user.id,
    });
    const endpoint = await loadBranchEndpoint({
      branch,
      database,
      db,
    });

    if (!endpoint) {
      throw new HTTPException(404, {
        message: "No endpoint is available for this branch",
      });
    }

    const connection = await resolveBranchRuntimeConnection({
      branch,
      controlDatabaseUrl: env.DATABASE_URL,
      database,
      endpoint,
    });
    const result = await executeBranchSql({
      connectionString: connection.connectionString,
      readOnly: input.readOnly,
      sql: input.sql,
    });

    return c.json({ result });
  });

  routes.post("/databases/:databaseId/branches", async (c) => {
    const user = requireUser(c);
    const input = await parseJson(c, createBranchRequestSchema);
    const db = c.get("db");
    const database = await assertDatabaseAccess({
      databaseId: c.req.param("databaseId"),
      db,
      userId: user.id,
    });
    const expiresAt = branchExpirationFromTtl(input.expirationTtl);
    const parentBranch = input.parentBranchId
      ? first(
          await db
            .select()
            .from(schema.branches)
            .where(eq(schema.branches.id, input.parentBranchId))
            .limit(1),
        )
      : null;

    if (input.parentBranchId && !parentBranch) {
      throw new HTTPException(400, {
        message: "Parent branch is not available",
      });
    }

    if (parentBranch && parentBranch.clusterId !== database.id) {
      throw new HTTPException(400, {
        message: "Parent branch must belong to the same database",
      });
    }

    if (parentBranch?.expiresAt) {
      throw new HTTPException(400, {
        message: "Branches with an expiration cannot be used as parents",
      });
    }

    if (parentBranch && parentBranch.status !== "ready") {
      throw new HTTPException(409, {
        message: "Parent branch must be ready before it can be cloned",
      });
    }

    const branch = {
      clusterId: database.id,
      copyMode: parentBranch ? input.copyMode : "schema_only",
      expiresAt,
      id: createId("branch"),
      name: input.name,
      parentBranchId: input.parentBranchId ?? null,
      status: parentBranch ? ("creating" as const) : ("ready" as const),
    };

    await db.insert(schema.branches).values(branch);

    if (parentBranch) {
      try {
        await startControlPlaneWorkflow({
          env,
          name: workflowNames.cloneBranch,
          payload: {
            clusterId: database.id,
            copyMode: branch.copyMode,
            provider: "local",
            sourceBranchId: parentBranch.id,
            targetBranchId: branch.id,
          },
          workflowId: `clone-branch-${branch.id}`,
        });
      } catch (error) {
        if (error instanceof WorkflowDispatchError) {
          await db
            .update(schema.branches)
            .set({ status: "failed", updatedAt: new Date() })
            .where(eq(schema.branches.id, branch.id))
            .catch(() => undefined);

          throw new HTTPException(503, {
            message:
              "Branch was recorded, but the clone workflow could not be started",
          });
        }

        throw error;
      }
    }

    return c.json(
      {
        branch: serializeBranch(branch),
      },
      parentBranch ? 202 : 201,
    );
  });

  routes.post("/databases/:databaseId/backups", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const database = await assertDatabaseAccess({
      databaseId: c.req.param("databaseId"),
      db,
      userId: user.id,
    });
    const backup = {
      clusterId: database.id,
      id: createId("backup_job"),
      status: "queued" as const,
    };

    await db.insert(schema.backupJobs).values(backup);

    try {
      await startControlPlaneWorkflow({
        env,
        name: workflowNames.createBackup,
        payload: {
          backupJobId: backup.id,
          clusterId: database.id,
        },
        workflowId: `backup-${backup.id}`,
      });
    } catch (error) {
      if (error instanceof WorkflowDispatchError) {
        throw new HTTPException(503, {
          message:
            "Backup job was recorded, but the backup workflow could not be started",
        });
      }

      throw error;
    }

    return c.json(
      {
        backupJob: {
          artifactUri: null,
          databaseId: backup.clusterId,
          errorMessage: null,
          finishedAt: null,
          id: backup.id,
          startedAt: null,
          status: backup.status,
        },
      },
      202,
    );
  });

  routes.post("/backups/:backupJobId/restores", async (c) => {
    const user = requireUser(c);
    const input = await parseJson(c, createRestoreRequestSchema);
    const db = c.get("db");
    const backup = first(
      await db
        .select()
        .from(schema.backupJobs)
        .where(eq(schema.backupJobs.id, c.req.param("backupJobId")))
        .limit(1),
    );

    if (!backup) {
      throw new HTTPException(404, {
        message: "Backup job not found",
      });
    }

    const database = await assertDatabaseAccess({
      databaseId: backup.clusterId,
      db,
      userId: user.id,
    });
    const branch = {
      clusterId: database.id,
      copyMode: "schema_and_data" as const,
      expiresAt: null,
      id: createId("branch"),
      name: input.targetBranchName,
      status: "creating" as const,
    };
    const restore = {
      backupJobId: backup.id,
      id: createId("restore_job"),
      status: "queued" as const,
      targetBranchId: branch.id,
    };

    await db.transaction(async (tx) => {
      await tx.insert(schema.branches).values(branch);
      await tx.insert(schema.restoreJobs).values(restore);
    });

    try {
      await startControlPlaneWorkflow({
        env,
        name: workflowNames.restoreBackup,
        payload: {
          backupJobId: backup.id,
          restoreJobId: restore.id,
          targetBranchId: branch.id,
        },
        workflowId: `restore-${restore.id}`,
      });
    } catch (error) {
      if (error instanceof WorkflowDispatchError) {
        throw new HTTPException(503, {
          message:
            "Restore job was recorded, but the restore workflow could not be started",
        });
      }

      throw error;
    }

    return c.json(
      {
        restoreJob: {
          backupJobId: restore.backupJobId,
          errorMessage: null,
          finishedAt: null,
          id: restore.id,
          startedAt: null,
          status: restore.status,
          targetBranchId: restore.targetBranchId,
        },
      },
      202,
    );
  });

  routes.get("/backups/:backupJobId", async (c) => {
    const user = requireUser(c);
    const db = c.get("db");
    const backup = first(
      await db
        .select()
        .from(schema.backupJobs)
        .where(eq(schema.backupJobs.id, c.req.param("backupJobId")))
        .limit(1),
    );

    if (!backup) {
      throw new HTTPException(404, {
        message: "Backup job not found",
      });
    }

    await assertDatabaseAccess({
      databaseId: backup.clusterId,
      db,
      userId: user.id,
    });

    return c.json({
      backupJob: {
        artifactUri: backup.artifactUri,
        databaseId: backup.clusterId,
        errorMessage: backup.errorMessage,
        finishedAt: serializeNullableDate(backup.finishedAt),
        id: backup.id,
        startedAt: serializeNullableDate(backup.startedAt),
        status: backup.status,
      },
    });
  });

  return routes;
}

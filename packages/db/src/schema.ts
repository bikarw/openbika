import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const providerKind = pgEnum("provider_kind", [
  "local",
  "strettch",
  "aos",
]);

export const planKind = pgEnum("plan_kind", [
  "developer",
  "startup_ha",
  "business_ha",
  "enterprise",
]);

export const clusterStatus = pgEnum("cluster_status", [
  "requested",
  "provisioning",
  "available",
  "degraded",
  "maintenance",
  "failed",
  "deleted",
]);

export const branchStatus = pgEnum("branch_status", [
  "requested",
  "creating",
  "ready",
  "failed",
  "archived",
]);

export const branchCopyMode = pgEnum("branch_copy_mode", [
  "schema_only",
  "schema_and_data",
]);

export const jobStatus = pgEnum("job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
  }),
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    ...timestamps,
  },
  (table) => ({
    userIdIdx: index("accounts_user_id_idx").on(table.userId),
  }),
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => ({
    identifierIdx: index("verifications_identifier_idx").on(table.identifier),
  }),
);

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => ({
    slugIdx: uniqueIndex("organizations_slug_idx").on(table.slug),
  }),
);

export const memberships = pgTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    ...timestamps,
  },
  (table) => ({
    organizationUserIdx: uniqueIndex("memberships_organization_user_idx").on(
      table.organizationId,
      table.userId,
    ),
  }),
);

export const providers = pgTable(
  "providers",
  {
    id: text("id").primaryKey(),
    kind: providerKind("kind").notNull(),
    name: text("name").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    ...timestamps,
  },
  (table) => ({
    kindIdx: uniqueIndex("providers_kind_idx").on(table.kind),
  }),
);

export const projects = pgTable(
  "projects",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ...timestamps,
  },
  (table) => ({
    organizationSlugIdx: uniqueIndex("projects_organization_slug_idx").on(
      table.organizationId,
      table.slug,
    ),
  }),
);

export const databaseClusters = pgTable(
  "database_clusters",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plan: planKind("plan").notNull(),
    status: clusterStatus("status").notNull().default("requested"),
    postgresVersion: text("postgres_version").notNull().default("18"),
    desiredState: jsonb("desired_state")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    observedState: jsonb("observed_state")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...timestamps,
  },
  (table) => ({
    projectNameIdx: uniqueIndex("database_clusters_project_name_idx").on(
      table.projectId,
      table.name,
    ),
    statusIdx: index("database_clusters_status_idx").on(table.status),
  }),
);

export const branches = pgTable(
  "branches",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => databaseClusters.id, { onDelete: "cascade" }),
    parentBranchId: text("parent_branch_id"),
    copyMode: branchCopyMode("copy_mode").notNull().default("schema_only"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    name: text("name").notNull(),
    status: branchStatus("status").notNull().default("requested"),
    ...timestamps,
  },
  (table) => ({
    clusterNameIdx: uniqueIndex("branches_cluster_name_idx").on(
      table.clusterId,
      table.name,
    ),
  }),
);

export const endpoints = pgTable(
  "endpoints",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => databaseClusters.id, { onDelete: "cascade" }),
    branchId: text("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    hostname: text("hostname").notNull(),
    port: integer("port").notNull().default(5432),
    poolerMode: text("pooler_mode").notNull().default("transaction"),
    ...timestamps,
  },
  (table) => ({
    hostnameIdx: uniqueIndex("endpoints_hostname_idx").on(table.hostname),
  }),
);

export const backupJobs = pgTable(
  "backup_jobs",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => databaseClusters.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    artifactUri: text("artifact_uri"),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => ({
    clusterStatusIdx: index("backup_jobs_cluster_status_idx").on(
      table.clusterId,
      table.status,
    ),
  }),
);

export const restoreJobs = pgTable(
  "restore_jobs",
  {
    id: text("id").primaryKey(),
    backupJobId: text("backup_job_id")
      .notNull()
      .references(() => backupJobs.id, { onDelete: "restrict" }),
    targetBranchId: text("target_branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("queued"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => ({
    statusIdx: index("restore_jobs_status_idx").on(table.status),
  }),
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    organizationCreatedAtIdx: index(
      "audit_events_organization_created_at_idx",
    ).on(table.organizationId, table.createdAt),
  }),
);

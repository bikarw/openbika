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

export const workloadKind = pgEnum("workload_kind", ["container", "function"]);

export const workloadStatus = pgEnum("workload_status", [
  "requested",
  "provisioning",
  "available",
  "degraded",
  "maintenance",
  "failed",
  "deleted",
]);

export const gitProviderType = pgEnum("git_provider_type", [
  "github",
  "gitlab",
  "bitbucket",
  "gitea",
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

/** S3-compatible backup/object-storage destinations (credentials stored in plaintext; encrypt-at-rest is future work). */
export const s3Destinations = pgTable(
  "s3_destinations",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider"),
    accessKey: text("access_key").notNull(),
    secretAccessKey: text("secret_access_key").notNull(),
    bucket: text("bucket").notNull(),
    region: text("region").notNull(),
    endpoint: text("endpoint").notNull(),
    additionalFlags: text("additional_flags").array().notNull(),
    ...timestamps,
  },
  (table) => ({
    organizationIdIdx: index("s3_destinations_organization_id_idx").on(
      table.organizationId,
    ),
  }),
);

export const webServerSettings = pgTable(
  "web_server_settings",
  {
    id: text("id").primaryKey(),
    singletonKey: text("singleton_key").notNull().default("default"),
    host: text("host"),
    https: boolean("https").default(false).notNull(),
    certificateType: text("certificate_type").notNull().default("none"),
    letsEncryptEmail: text("lets_encrypt_email"),
    applyStatus: text("apply_status").notNull().default("not_configured"),
    lastAppliedAt: timestamp("last_applied_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => ({
    singletonKeyIdx: uniqueIndex("web_server_settings_singleton_key_idx").on(
      table.singletonKey,
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

export const projectWorkloads = pgTable(
  "project_workloads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: workloadKind("kind").notNull(),
    status: workloadStatus("status").notNull().default("requested"),
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
    projectNameIdx: uniqueIndex("project_workloads_project_name_idx").on(
      table.projectId,
      table.name,
    ),
    statusIdx: index("project_workloads_status_idx").on(table.status),
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
    internetAccessEnabled: boolean("internet_access_enabled")
      .default(false)
      .notNull(),
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
    clusterHostnamePortIdx: uniqueIndex("endpoints_cluster_hostname_port_idx").on(
      table.clusterId,
      table.hostname,
      table.port,
    ),
  }),
);

export const backupJobs = pgTable(
  "backup_jobs",
  {
    id: text("id").primaryKey(),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => databaseClusters.id, { onDelete: "cascade" }),
    branchId: text("branch_id").references(() => branches.id, {
      onDelete: "set null",
    }),
    s3DestinationId: text("s3_destination_id").references(
      () => s3Destinations.id,
      { onDelete: "set null" },
    ),
    scheduleId: text("schedule_id"),
    pathPrefix: text("path_prefix"),
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
    clusterBranchCreatedAtIdx: index(
      "backup_jobs_cluster_branch_created_at_idx",
    ).on(table.clusterId, table.branchId, table.createdAt),
  }),
);

export const backupSchedules = pgTable(
  "backup_schedules",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    clusterId: text("cluster_id")
      .notNull()
      .references(() => databaseClusters.id, { onDelete: "cascade" }),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    s3DestinationId: text("s3_destination_id")
      .notNull()
      .references(() => s3Destinations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    cronExpression: text("cron_expression").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    pathPrefix: text("path_prefix"),
    retentionKeepLast: integer("retention_keep_last"),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    clusterIdx: index("backup_schedules_cluster_idx").on(table.clusterId),
    enabledNextRunIdx: index("backup_schedules_enabled_next_run_idx").on(
      table.enabled,
      table.nextRunAt,
    ),
    branchNameIdx: uniqueIndex("backup_schedules_branch_name_idx").on(
      table.branchId,
      table.name,
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

/** Git provider connections (GitHub, GitLab, Bitbucket, Gitea). Credentials stored in plaintext; encrypt-at-rest is future work. */
export const gitProviders = pgTable(
  "git_providers",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    providerType: gitProviderType("provider_type").notNull(),
    ...timestamps,
  },
  (table) => ({
    organizationIdIdx: index("git_providers_organization_id_idx").on(
      table.organizationId,
    ),
  }),
);

export const githubProviders = pgTable("github_providers", {
  id: text("id").primaryKey(),
  gitProviderId: text("git_provider_id")
    .notNull()
    .unique()
    .references(() => gitProviders.id, { onDelete: "cascade" }),
  appName: text("app_name"),
  appId: integer("app_id"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  installationId: text("installation_id"),
  privateKey: text("private_key"),
  webhookSecret: text("webhook_secret"),
  ...timestamps,
});

export const gitlabProviders = pgTable("gitlab_providers", {
  id: text("id").primaryKey(),
  gitProviderId: text("git_provider_id")
    .notNull()
    .unique()
    .references(() => gitProviders.id, { onDelete: "cascade" }),
  gitlabUrl: text("gitlab_url").notNull().default("https://gitlab.com"),
  gitlabInternalUrl: text("gitlab_internal_url"),
  applicationId: text("application_id"),
  redirectUri: text("redirect_uri"),
  secret: text("secret"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  groupName: text("group_name"),
  expiresAt: integer("expires_at"),
  ...timestamps,
});

export const bitbucketProviders = pgTable("bitbucket_providers", {
  id: text("id").primaryKey(),
  gitProviderId: text("git_provider_id")
    .notNull()
    .unique()
    .references(() => gitProviders.id, { onDelete: "cascade" }),
  username: text("username"),
  email: text("email"),
  appPassword: text("app_password"),
  apiToken: text("api_token"),
  workspaceName: text("workspace_name"),
  ...timestamps,
});

export const giteaProviders = pgTable("gitea_providers", {
  id: text("id").primaryKey(),
  gitProviderId: text("git_provider_id")
    .notNull()
    .unique()
    .references(() => gitProviders.id, { onDelete: "cascade" }),
  giteaUrl: text("gitea_url").notNull().default("https://gitea.com"),
  giteaInternalUrl: text("gitea_internal_url"),
  redirectUri: text("redirect_uri"),
  clientId: text("client_id"),
  clientSecret: text("client_secret"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  expiresAt: integer("expires_at"),
  scopes: text("scopes").notNull().default("repo,read:user,read:org"),
  lastAuthenticatedAt: timestamp("last_authenticated_at", {
    withTimezone: true,
  }),
  ...timestamps,
});

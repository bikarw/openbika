import { z } from "zod";

export const idSchema = z.string().min(1);
export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const providerKindSchema = z.enum(["local", "strettch", "aos"]);
export type ProviderKind = z.infer<typeof providerKindSchema>;

export const clusterStatusSchema = z.enum([
  "requested",
  "provisioning",
  "available",
  "degraded",
  "maintenance",
  "failed",
  "deleted",
]);
export type ClusterStatus = z.infer<typeof clusterStatusSchema>;

export const branchStatusSchema = z.enum([
  "requested",
  "creating",
  "ready",
  "failed",
  "archived",
]);
export type BranchStatus = z.infer<typeof branchStatusSchema>;

export const branchCopyModeSchema = z.enum(["schema_only", "schema_and_data"]);
export type BranchCopyMode = z.infer<typeof branchCopyModeSchema>;

export const branchExpirationTtlSchema = z.enum(["1h", "1d", "7d"]);
export type BranchExpirationTtl = z.infer<typeof branchExpirationTtlSchema>;

export const jobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  service: z.string(),
  version: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const providerResponseSchema = z.object({
  id: idSchema,
  kind: providerKindSchema,
  name: z.string(),
});
export type ProviderResponse = z.infer<typeof providerResponseSchema>;

export const createOrganizationRequestSchema = z.object({
  name: z.string().min(1).max(120),
  slug: slugSchema,
});
export type CreateOrganizationRequest = z.infer<
  typeof createOrganizationRequestSchema
>;

export const organizationResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  role: z.string(),
  slug: slugSchema,
});
export type OrganizationResponse = z.infer<typeof organizationResponseSchema>;

export const createProjectRequestSchema = z.object({
  name: z.string().min(1).max(120),
  organizationId: idSchema,
  slug: slugSchema,
});
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;

export const projectResponseSchema = z.object({
  id: idSchema,
  name: z.string(),
  organizationId: idSchema,
  slug: slugSchema,
});
export type ProjectResponse = z.infer<typeof projectResponseSchema>;

export const projectSummaryResponseSchema = projectResponseSchema.extend({
  branchCount: z.number().int().nonnegative(),
  databaseCount: z.number().int().nonnegative(),
  hasFailure: z.boolean(),
  isProvisioning: z.boolean(),
  workloadCount: z.number().int().nonnegative(),
});
export type ProjectSummaryResponse = z.infer<
  typeof projectSummaryResponseSchema
>;

export const endpointResponseSchema = z.object({
  hostname: z.string(),
  id: idSchema,
  poolerMode: z.string(),
  port: z.number().int().positive(),
});
export type EndpointResponse = z.infer<typeof endpointResponseSchema>;

export const branchConnectionResponseSchema = z.object({
  branchId: idSchema,
  connectionString: z.string(),
  databaseId: idSchema,
  databaseName: z.string(),
  maskedConnectionString: z.string(),
  username: z.string(),
});
export type BranchConnectionResponse = z.infer<
  typeof branchConnectionResponseSchema
>;

export const branchSchemaColumnResponseSchema = z.object({
  dataType: z.string(),
  defaultValue: z.string().nullable(),
  isNullable: z.boolean(),
  isPrimaryKey: z.boolean(),
  name: z.string(),
  ordinalPosition: z.number().int().positive(),
});
export type BranchSchemaColumnResponse = z.infer<
  typeof branchSchemaColumnResponseSchema
>;

export const branchSchemaTableResponseSchema = z.object({
  columns: z.array(branchSchemaColumnResponseSchema),
  estimatedRows: z.number().int().nonnegative().nullable(),
  name: z.string(),
  schema: z.string(),
  type: z.string(),
});
export type BranchSchemaTableResponse = z.infer<
  typeof branchSchemaTableResponseSchema
>;

export const branchSchemaResponseSchema = z.object({
  branchId: idSchema,
  tables: z.array(branchSchemaTableResponseSchema),
});
export type BranchSchemaResponse = z.infer<typeof branchSchemaResponseSchema>;

export const executeBranchQueryRequestSchema = z.object({
  readOnly: z.boolean().default(true),
  sql: z.string().min(1).max(100_000),
});
export type ExecuteBranchQueryRequest = z.infer<
  typeof executeBranchQueryRequestSchema
>;

export const branchQueryColumnResponseSchema = z.object({
  dataTypeId: z.number().int(),
  name: z.string(),
});
export type BranchQueryColumnResponse = z.infer<
  typeof branchQueryColumnResponseSchema
>;

export const branchQueryResponseSchema = z.object({
  columns: z.array(branchQueryColumnResponseSchema),
  command: z.string(),
  durationMs: z.number().nonnegative(),
  readOnly: z.boolean(),
  rowCount: z.number().int().nonnegative(),
  rows: z.array(z.record(z.string(), z.unknown())),
  truncated: z.boolean(),
});
export type BranchQueryResponse = z.infer<typeof branchQueryResponseSchema>;

export const branchResponseSchema = z.object({
  copyMode: branchCopyModeSchema,
  expiresAt: z.string().nullable(),
  id: idSchema,
  name: z.string(),
  parentBranchId: idSchema.nullable(),
  status: branchStatusSchema,
});
export type BranchResponse = z.infer<typeof branchResponseSchema>;

export const databaseResponseSchema = z.object({
  branches: z.array(branchResponseSchema).default([]),
  endpoint: endpointResponseSchema.nullable(),
  id: idSchema,
  name: z.string(),
  postgresVersion: z.string(),
  projectId: idSchema,
  status: clusterStatusSchema,
});
export type DatabaseResponse = z.infer<typeof databaseResponseSchema>;

export const workloadKindSchema = z.enum(["container", "function"]);
export type WorkloadKind = z.infer<typeof workloadKindSchema>;

export const workloadStatusSchema = z.enum([
  "requested",
  "provisioning",
  "available",
  "degraded",
  "maintenance",
  "failed",
  "deleted",
]);
export type WorkloadStatus = z.infer<typeof workloadStatusSchema>;

export const workloadResponseSchema = z.object({
  createdAt: z.string(),
  desiredState: z.record(z.string(), z.unknown()),
  id: idSchema,
  kind: workloadKindSchema,
  name: z.string(),
  observedState: z.record(z.string(), z.unknown()),
  projectId: idSchema,
  status: workloadStatusSchema,
  updatedAt: z.string(),
});
export type WorkloadResponse = z.infer<typeof workloadResponseSchema>;

const workloadNameSchema = z.string().min(1).max(63);

export const createContainerWorkloadRequestSchema = z.object({
  build: z
    .object({
      contextUri: z.string().min(1).optional(),
      dockerfilePath: z.string().min(1).optional(),
    })
    .optional(),
  env: z.record(z.string(), z.string()).optional(),
  image: z.string().min(1).optional(),
  kind: z.literal("container"),
  name: workloadNameSchema,
  ports: z.array(z.number().int().min(1).max(65535)).max(16).optional(),
});
export type CreateContainerWorkloadRequest = z.infer<
  typeof createContainerWorkloadRequestSchema
>;

export const functionRuntimeSchema = z.enum(["node", "bun"]);
export type FunctionRuntime = z.infer<typeof functionRuntimeSchema>;

export const functionSourceSchema = z.discriminatedUnion("type", [
  z.object({
    image: z.string().min(1),
    type: z.literal("image"),
  }),
  z.object({
    artifactUri: z.string().min(1),
    type: z.literal("bundle"),
  }),
  z.object({
    path: z.string().min(1).max(512).optional(),
    ref: z.string().min(1).max(255).optional(),
    repositoryUrl: z.string().min(1).max(2048),
    type: z.literal("git"),
  }),
]);
export type FunctionSource = z.infer<typeof functionSourceSchema>;

export const createFunctionWorkloadRequestSchema = z.object({
  entrypoint: z.string().min(1).default("index.ts"),
  kind: z.literal("function"),
  name: workloadNameSchema,
  runtime: functionRuntimeSchema,
  source: functionSourceSchema,
});
export type CreateFunctionWorkloadRequest = z.infer<
  typeof createFunctionWorkloadRequestSchema
>;

export const createWorkloadRequestSchema = z
  .discriminatedUnion("kind", [
    createContainerWorkloadRequestSchema,
    createFunctionWorkloadRequestSchema,
  ])
  .superRefine((value, ctx) => {
    if (value.kind !== "container") {
      return;
    }

    const hasImage = value.image !== undefined && value.image.length > 0;
    const hasBuild =
      value.build !== undefined &&
      (value.build.dockerfilePath !== undefined ||
        value.build.contextUri !== undefined);

    if (!hasImage && !hasBuild) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Container workload requires an image, or build context / Dockerfile metadata in build",
        path: ["image"],
      });
    }
  });
export type CreateWorkloadRequest = z.infer<typeof createWorkloadRequestSchema>;

export const createDatabaseRequestSchema = z.object({
  name: z.string().min(1).max(63),
  postgresVersion: z.string().default("18"),
});
export type CreateDatabaseRequest = z.infer<typeof createDatabaseRequestSchema>;

export const createBranchRequestSchema = z.object({
  copyMode: branchCopyModeSchema.default("schema_only"),
  expirationTtl: branchExpirationTtlSchema.optional(),
  name: z.string().min(1).max(63),
  parentBranchId: idSchema.optional(),
});
export type CreateBranchRequest = z.infer<typeof createBranchRequestSchema>;

export const backupJobResponseSchema = z.object({
  artifactUri: z.string().nullable(),
  databaseId: idSchema,
  errorMessage: z.string().nullable(),
  finishedAt: z.string().nullable(),
  id: idSchema,
  startedAt: z.string().nullable(),
  status: jobStatusSchema,
});
export type BackupJobResponse = z.infer<typeof backupJobResponseSchema>;

export const createRestoreRequestSchema = z.object({
  targetBranchName: z.string().min(1).max(63).default("restore"),
});
export type CreateRestoreRequest = z.infer<typeof createRestoreRequestSchema>;

export const restoreJobResponseSchema = z.object({
  backupJobId: idSchema,
  errorMessage: z.string().nullable(),
  finishedAt: z.string().nullable(),
  id: idSchema,
  startedAt: z.string().nullable(),
  status: jobStatusSchema,
  targetBranchId: idSchema,
});
export type RestoreJobResponse = z.infer<typeof restoreJobResponseSchema>;

export const provisionClusterInputSchema = z.object({
  clusterId: idSchema,
  projectId: idSchema,
  provider: providerKindSchema,
  postgresVersion: z.string().default("18"),
});
export type ProvisionClusterInput = z.infer<typeof provisionClusterInputSchema>;

export const createBackupInputSchema = z.object({
  backupJobId: idSchema,
  clusterId: idSchema,
});
export type CreateBackupInput = z.infer<typeof createBackupInputSchema>;

export const restoreBackupInputSchema = z.object({
  restoreJobId: idSchema,
  backupJobId: idSchema,
  targetBranchId: idSchema,
});
export type RestoreBackupInput = z.infer<typeof restoreBackupInputSchema>;

export const cloneBranchInputSchema = z.object({
  clusterId: idSchema,
  copyMode: branchCopyModeSchema,
  provider: providerKindSchema,
  sourceBranchId: idSchema,
  targetBranchId: idSchema,
});
export type CloneBranchInput = z.infer<typeof cloneBranchInputSchema>;

export const rotateCredentialsInputSchema = z.object({
  clusterId: idSchema,
  roleName: z.string().min(1),
});
export type RotateCredentialsInput = z.infer<
  typeof rotateCredentialsInputSchema
>;

export const provisionWorkloadInputSchema = z.object({
  desiredState: z.record(z.string(), z.unknown()),
  kind: workloadKindSchema,
  projectId: idSchema,
  provider: providerKindSchema,
  workloadId: idSchema,
});
export type ProvisionWorkloadInput = z.infer<
  typeof provisionWorkloadInputSchema
>;

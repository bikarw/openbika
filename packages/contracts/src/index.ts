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

export const serverDomainCertificateTypeSchema = z.enum([
  "letsencrypt",
  "none",
]);
export type ServerDomainCertificateType = z.infer<
  typeof serverDomainCertificateTypeSchema
>;

export const serverDomainApplyStatusSchema = z.enum([
  "applied",
  "failed",
  "not_configured",
]);
export type ServerDomainApplyStatus = z.infer<
  typeof serverDomainApplyStatusSchema
>;

export const serverDomainSettingsResponseSchema = z.object({
  applyStatus: serverDomainApplyStatusSchema,
  certificateType: serverDomainCertificateTypeSchema,
  host: z.string().nullable(),
  https: z.boolean(),
  id: idSchema,
  lastAppliedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  letsEncryptEmail: z.string().nullable(),
  updatedAt: z.string(),
});
export type ServerDomainSettingsResponse = z.infer<
  typeof serverDomainSettingsResponseSchema
>;

export const patchServerDomainSettingsRequestSchema = z
  .object({
    certificateType: serverDomainCertificateTypeSchema.optional(),
    host: z.string().nullable().optional(),
    https: z.boolean().optional(),
    letsEncryptEmail: z
      .union([z.string().email(), z.literal(""), z.null()])
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.https !== true) return;
    const certificateType = value.certificateType ?? "letsencrypt";
    if (certificateType !== "letsencrypt") return;
    if (
      value.letsEncryptEmail === null ||
      value.letsEncryptEmail === undefined ||
      value.letsEncryptEmail === ""
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Let's Encrypt email is required when automatic SSL is enabled",
        path: ["letsEncryptEmail"],
      });
    }
  });
export type PatchServerDomainSettingsRequest = z.infer<
  typeof patchServerDomainSettingsRequestSchema
>;

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
  observedState: z.record(z.string(), z.unknown()),
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
  /** When the API is configured with an edge base domain, UI can pre-fill platform hostnames. */
  edge: z
    .object({
      embeddedPublicIpv4: z.string().optional(),
      freeDnsZone: z.enum(["nip.io", "sslip.io"]).optional(),
      publicBaseDomain: z.string(),
      suggestedDefaultHostname: z.string(),
    })
    .optional(),
  id: idSchema,
  kind: workloadKindSchema,
  name: z.string(),
  observedState: z.record(z.string(), z.unknown()),
  projectId: idSchema,
  status: workloadStatusSchema,
  updatedAt: z.string(),
});
export type WorkloadResponse = z.infer<typeof workloadResponseSchema>;

export const workloadRuntimeLogsResponseSchema = z.object({
  logs: z.string(),
});
export type WorkloadRuntimeLogsResponse = z.infer<
  typeof workloadRuntimeLogsResponseSchema
>;

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
  env: z.record(z.string(), z.string()).optional(),
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

export const patchWorkloadEnvRequestSchema = z.object({
  env: z.record(z.string(), z.string()),
});
export type PatchWorkloadEnvRequest = z.infer<
  typeof patchWorkloadEnvRequestSchema
>;

/** Default container listen port for bundled/function images when desiredState.ports is empty. */
export const WORKLOAD_FUNCTION_DEFAULT_LISTEN_PORT = 9100;

/** Max additional ingress domains (beyond the synthesized platform hostname) per workload. */
export const MAX_WORKLOAD_INGRESS_DOMAINS = 20;

/** @deprecated Prefer {@link MAX_WORKLOAD_INGRESS_DOMAINS}; kept for transitional imports. */
export const MAX_WORKLOAD_INGRESS_HOSTNAMES = MAX_WORKLOAD_INGRESS_DOMAINS;

/**
 * Validates and normalizes a user-supplied ingress hostname for the network
 * `Host` Traefik matcher (ASCII / punycode via URL).
 */
export function normalizeServerDomainHost(raw: string): string {
  const trimmed = raw.trim();
  const withScheme = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.port) {
      throw new Error("Server domain must not include a port");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("port")) {
      throw error;
    }
  }
  const host = normalizeWorkloadCustomHostname(trimmed);
  if (host.includes(":")) {
    throw new Error("Server domain must not include a port");
  }
  return host;
}

export function normalizeWorkloadCustomHostname(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Hostname cannot be empty");
  }
  const withScheme = trimmed.includes("://") ? trimmed : `http://${trimmed}`;
  try {
    const host = new URL(withScheme).hostname;
    if (!host) {
      throw new Error("Invalid hostname");
    }
    return host.toLowerCase();
  } catch {
    throw new Error("Invalid hostname");
  }
}

export function tryNormalizeWorkloadIngressHostname(raw: string): string | null {
  try {
    return normalizeWorkloadCustomHostname(raw);
  } catch {
    return null;
  }
}

/** Punycode / ASCII hostname segment for ingress (matches Traefik Docker label rules). */
export function ingressPunyHostname(part: string): string {
  const trimmed = part.trim().replace(/^https?:\/\//i, "").split("/")[0] ?? "";
  if (!trimmed) {
    return part;
  }
  try {
    return new URL(`http://${trimmed}`).hostname;
  } catch {
    return trimmed;
  }
}

export function workloadIdToEdgeDnsLabel(workloadId: string): string {
  return workloadId.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "");
}

/** Suggested `*.PUBLIC_BASE_DOMAIN` hostname for workloads (DNS label safe). */
export function suggestWorkloadEdgeHostname(
  workloadId: string,
  publicBaseDomain: string,
): string {
  const domain = publicBaseDomain
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, "");
  const left = workloadIdToEdgeDnsLabel(workloadId);
  return ingressPunyHostname(`${left}.${domain}`);
}

/** Suffixes with public wildcard DNS: `{anything}.{IPv4}.{zone}` → that IPv4. */
export const ingressEmbeddedIpFreeDnsZones = ["nip.io", "sslip.io"] as const;
export type IngressEmbeddedIpFreeDnsZone =
  (typeof ingressEmbeddedIpFreeDnsZones)[number];

const IPV4_DOTTED_RE =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Validates dotted IPv4 for nip.io/sslip-style hostnames (`id.203.0.113.54.nip.io`). */
export function parseIngressEmbeddedPublicIpv4(raw: string): string | null {
  const s = raw.trim();
  return IPV4_DOTTED_RE.test(s) ? s : null;
}

export function normalizeIngressFreeDnsZone(
  raw: string | undefined,
): IngressEmbeddedIpFreeDnsZone | null {
  const z = raw?.trim().toLowerCase();
  return z === "nip.io" || z === "sslip.io" ? z : null;
}

/** RFC 1035 DNS label length limit. */
const DNS_LABEL_MAX = 63;

function truncateDnsLabel(raw: string, max = DNS_LABEL_MAX): string {
  return raw.length <= max ? raw : raw.slice(0, max);
}

/**
 * Platform hostname resolved via nip.io/sslip wildcard DNS (Traefik-compatible; no registrar).
 * Requires a **routable** IPv4 (Let’s Encrypt HTTP-01 must reach this Traefik instance).
 *
 * - **nip.io**: `{workload-label}.{dotted IPv4}.nip.io` (nip resolves the embedded quad).
 * - **sslip.io**: `{workload-prefix}-{dashed IPv4}.sslip.io` — single left label
 *   with dashes instead of dots so sslip resolves to the same IPv4 from any resolver.
 */
export function suggestWorkloadEmbeddedIpIngressHostname(
  workloadId: string,
  dottedIpv4: string,
  zone: IngressEmbeddedIpFreeDnsZone,
): string {
  const ip = parseIngressEmbeddedPublicIpv4(dottedIpv4);
  if (!ip) {
    throw new Error("embeddedPublicIpv4 must be a dotted IPv4 address");
  }
  const left = truncateDnsLabel(workloadIdToEdgeDnsLabel(workloadId));

  if (zone === "sslip.io") {
    const dashedIp = ip.replaceAll(".", "-");
    const maxPrefixLen = DNS_LABEL_MAX - dashedIp.length - 1; // hyphen before dashed IP
    const prefix =
      maxPrefixLen > 0 ? truncateDnsLabel(left, maxPrefixLen) : "";
    const single = prefix.length > 0 ? `${prefix}-${dashedIp}` : dashedIp;
    return ingressPunyHostname(`${single}.sslip.io`);
  }

  return ingressPunyHostname(`${left}.${ip}.${zone}`);
}

/** Normalizes ingress path prefixes (leading slash, trims trailing slashes except `/`). */
export function normalizeWorkloadIngressPath(raw: string): string {
  const t = raw.trim();
  if (!t || t === "/") {
    return "/";
  }
  const withSlash = t.startsWith("/") ? t : `/${t}`;
  const noTrail = withSlash.replace(/\/+$/, "");
  return noTrail === "" ? "/" : noTrail;
}

export function readWorkloadPortsArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(
    (p): p is number =>
      typeof p === "number" &&
      Number.isInteger(p) &&
      p >= 1 &&
      p <= 65535,
  );
}

export function resolveWorkloadEffectiveListenPorts(
  desiredState: Record<string, unknown>,
  workloadKind: "container" | "function",
): number[] {
  const ports = readWorkloadPortsArray(desiredState.ports);
  if (ports.length > 0) {
    return ports;
  }
  return workloadKind === "function"
    ? [WORKLOAD_FUNCTION_DEFAULT_LISTEN_PORT]
    : [];
}

export function workloadIngressDedupeKey(input: {
  hostname: string;
  containerPort: number;
  path: string;
  https: boolean;
}): string {
  return `${input.hostname.toLowerCase()}|${normalizeWorkloadIngressPath(input.path)}|${String(input.containerPort)}|${input.https ? "1" : "0"}`;
}

export interface WorkloadIngressDomain {
  hostname: string;
  containerPort: number;
  path: string;
  https: boolean;
}

export interface WorkloadIngressAppliedRoute extends WorkloadIngressDomain {
  url: string;
}

/** Public URL for one ingress row (host + scheme + PathPrefix semantics). */
export function workloadIngressRoutePublicUrl(domain: WorkloadIngressDomain): string {
  const scheme = domain.https ? "https" : "http";
  const host = ingressPunyHostname(domain.hostname);
  const path = normalizeWorkloadIngressPath(domain.path);
  try {
    return new URL(path === "/" ? "/" : path, `${scheme}://${host}`).href;
  } catch {
    const suffix =
      path === "/" ? "/" : path.startsWith("/") ? path : `/${path}`;
    return `${scheme}://${host}${suffix}`;
  }
}

export function readObservedWorkloadIngressRoutes(
  observedState: Record<string, unknown>,
): WorkloadIngressAppliedRoute[] {
  const raw = observedState.ingressRoutes;
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: WorkloadIngressAppliedRoute[] = [];
  for (const item of raw) {
    if (
      item === null ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      typeof (item as { url?: unknown }).url !== "string" ||
      typeof (item as { hostname?: unknown }).hostname !== "string" ||
      typeof (item as { containerPort?: unknown }).containerPort !== "number"
    ) {
      continue;
    }
    const it = item as Record<string, unknown>;
    const path =
      typeof it.path === "string" ? normalizeWorkloadIngressPath(it.path) : "/";
    const https = typeof it.https === "boolean" ? it.https : true;
    const url = (it.url as string).trim();
    if (!url) {
      continue;
    }
    out.push({
      url,
      hostname: (it.hostname as string).trim().toLowerCase(),
      containerPort: it.containerPort as number,
      path,
      https,
    });
  }
  return out;
}

function tryParseWorkloadIngressDomainRaw(
  value: unknown,
): WorkloadIngressDomain | null {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }
  const r = value as Record<string, unknown>;
  if (typeof r.hostname !== "string") {
    return null;
  }
  const hostNorm = tryNormalizeWorkloadIngressHostname(r.hostname);
  if (!hostNorm) {
    return null;
  }
  const port = r.containerPort;
  if (
    typeof port !== "number" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }
  const pathNorm =
    typeof r.path === "string"
      ? normalizeWorkloadIngressPath(r.path)
      : "/";
  const https = typeof r.https === "boolean" ? r.https : true;
  return {
    hostname: hostNorm,
    containerPort: port,
    path: pathNorm,
    https,
  };
}

/** When true, the provisioner skips the synthesized platform Traefik hostname (nip/sslip / owned base). */
export function readOmitPlatformHostname(
  desiredState: Record<string, unknown>,
): boolean {
  const ingress = desiredState.ingress;
  if (
    ingress === null ||
    typeof ingress !== "object" ||
    Array.isArray(ingress)
  ) {
    return false;
  }
  return (ingress as Record<string, unknown>).omitPlatformHostname === true;
}

/** Custom ingress from `desiredState.ingress.domains`, with legacy `{ hostnames }` migration. */
export function readWorkloadIngressDomains(
  desiredState: Record<string, unknown>,
  workloadKind: "container" | "function",
): WorkloadIngressDomain[] {
  const ingress = desiredState.ingress;
  if (
    ingress === null ||
    typeof ingress !== "object" ||
    Array.isArray(ingress)
  ) {
    return [];
  }
  const rec = ingress as Record<string, unknown>;
  const effective = resolveWorkloadEffectiveListenPorts(desiredState, workloadKind);
  const fallbackPort = effective[0];

  const domainList = rec.domains;
  if (Array.isArray(domainList)) {
    const seen = new Set<string>();
    const out: WorkloadIngressDomain[] = [];
    for (const entry of domainList) {
      const d = tryParseWorkloadIngressDomainRaw(entry);
      if (!d) {
        continue;
      }
      const k = workloadIngressDedupeKey(d);
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      out.push(d);
      if (out.length >= MAX_WORKLOAD_INGRESS_DOMAINS) {
        break;
      }
    }
    return out;
  }

  const list = rec.hostnames;
  if (!Array.isArray(list) || fallbackPort === undefined) {
    return [];
  }
  const seen = new Set<string>();
  const out: WorkloadIngressDomain[] = [];
  for (const entry of list) {
    if (typeof entry !== "string") {
      continue;
    }
    const n = tryNormalizeWorkloadIngressHostname(entry);
    if (!n) {
      continue;
    }
    const row: WorkloadIngressDomain = {
      hostname: n,
      containerPort: fallbackPort,
      path: "/",
      https: true,
    };
    const k = workloadIngressDedupeKey(row);
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(row);
    if (out.length >= MAX_WORKLOAD_INGRESS_DOMAINS) {
      break;
    }
  }
  return out;
}

/** @deprecated Prefer {@link readWorkloadIngressDomains}. */
export function readWorkloadIngressHostnames(
  desiredState: Record<string, unknown>,
  workloadKind: "container" | "function",
): string[] {
  return readWorkloadIngressDomains(desiredState, workloadKind).map(
    (d) => d.hostname,
  );
}

export const workloadIngressDomainInputSchema = z
  .object({
    hostname: z.string(),
    containerPort: z.number().int().min(1).max(65535),
    path: z.string().optional(),
    https: z.boolean().optional(),
  })
  .transform((v) => {
    const hostname = normalizeWorkloadCustomHostname(v.hostname);
    const pathNorm = normalizeWorkloadIngressPath(v.path ?? "/");
    const https = v.https ?? true;
    return {
      hostname,
      containerPort: v.containerPort,
      path: pathNorm,
      https,
    } satisfies WorkloadIngressDomain;
  });

export const patchWorkloadIngressDomainsRequestSchema = z.object({
  domains: z
    .array(workloadIngressDomainInputSchema)
    .max(MAX_WORKLOAD_INGRESS_DOMAINS),
  omitPlatformHostname: z.boolean().optional(),
});
export type PatchWorkloadIngressDomainsRequest = z.infer<
  typeof patchWorkloadIngressDomainsRequestSchema
>;

export const patchWorkloadIngressHostnamesRequestSchema =
  patchWorkloadIngressDomainsRequestSchema;

export type PatchWorkloadIngressHostnamesRequest = PatchWorkloadIngressDomainsRequest;

export function dedupeWorkloadIngressDomainsOrThrow(
  domains: WorkloadIngressDomain[],
): WorkloadIngressDomain[] {
  return dedupeWorkloadIngressDomains(domains);
}

export function dedupeWorkloadIngressDomains(
  domains: WorkloadIngressDomain[],
): WorkloadIngressDomain[] {
  const seen = new Set<string>();
  const out: WorkloadIngressDomain[] = [];
  for (const d of domains) {
    const normalized: WorkloadIngressDomain = {
      hostname: d.hostname.toLowerCase(),
      containerPort: d.containerPort,
      path: normalizeWorkloadIngressPath(d.path),
      https: d.https,
    };
    const key = workloadIngressDedupeKey(normalized);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(normalized);
  }
  if (out.length > MAX_WORKLOAD_INGRESS_DOMAINS) {
    throw new Error(
      `At most ${String(MAX_WORKLOAD_INGRESS_DOMAINS)} ingress domains are allowed`,
    );
  }
  return out;
}

/** Omits entries whose values are empty or whitespace-only (not valid workload env values). */
export function pruneBlankWorkloadEnv(
  env: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(env)) {
    if (typeof raw !== "string" || raw.trim().length === 0) {
      continue;
    }
    out[key] = raw;
  }
  return out;
}

/** Control-plane events surfaced in workload / cluster Logs tabs. */
export const controlPlaneActivityLogEntrySchema = z.object({
  at: z.string(),
  message: z.string(),
});
export type ControlPlaneActivityLogEntry = z.infer<
  typeof controlPlaneActivityLogEntrySchema
>;

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

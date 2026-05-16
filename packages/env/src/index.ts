import { z } from "zod";

const booleanStringSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export const runtimeEnvironmentSchema = z.enum([
  "development",
  "test",
  "staging",
  "production",
]);

export type RuntimeEnvironment = z.infer<typeof runtimeEnvironmentSchema>;

export const baseEnvSchema = z.object({
  NODE_ENV: runtimeEnvironmentSchema.default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal", "silent"])
    .default("info"),
  ENABLE_PRETTY_LOGS: booleanStringSchema.default(false),
});

export const apiEnvSchema = baseEnvSchema.extend({
  /** Bind address (`localhost` for usual dev); set `0.0.0.0` only if you need LAN access to the machine. */
  API_HOST: z.string().default("localhost"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  API_PUBLIC_URL: z.string().url().default("http://localhost:8787"),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:8787"),
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("default"),
  TEMPORAL_TASK_QUEUE: z.string().default("openbika-control-plane"),

  /** Preferred public suffix for synthesized workload URLs (shown on Workload payloads as `edge`). */
  OPENBIKA_EDGE_PUBLIC_BASE_DOMAIN: z.string().optional(),
  /** Alias for stacks that already set the worker/env name; overrides when edge domain is omitted. */
  OPENBIKA_PUBLIC_BASE_DOMAIN: z.string().optional(),
  /**
   * When set with `OPENBIKA_INGRESS_PUBLIC_IPV4`, platform hostnames use public wildcard DNS
   * (nip.io: `{label}.{IPv4}.nip.io`, sslip.io: `{label}-{dashed IPv4}.sslip.io`; no registrar).
   */
  OPENBIKA_INGRESS_FREE_DNS_ZONE: z.enum(["nip.io", "sslip.io"]).optional(),
  /**
   * Dotted IPv4 embedded in nip/sslip hostnames, `auto`/empty for WAN discovery at startup,
   * or `loopback` → `127.0.0.1` for Docker Traefik on the same laptop.
   */
  OPENBIKA_INGRESS_PUBLIC_IPV4: z.string().optional(),
  /**
   * When nip.io/sslip ingress is configured, HTTP stays on `:80` (no Traefik redirect) so links work before Let’s Encrypt and HTTP-01 is less fragile. Set `true` on the worker to force HTTPS links + redirect (owned-domain default).
   */
  OPENBIKA_TRAEFIK_SECURE_INGRESS: z.enum(["true", "false"]).optional(),
  /** Directory watched by Traefik's file provider for dynamic OpenBika router config. */
  OPENBIKA_TRAEFIK_DYNAMIC_DIR: z.string().optional(),
  /** Main Traefik static config path; used to update the Let's Encrypt account email when writable. */
  OPENBIKA_TRAEFIK_MAIN_CONFIG: z.string().optional(),
  /** Docker Compose .env path; used as a fallback for OPENBIKA_TRAEFIK_ACME_EMAIL. */
  OPENBIKA_TRAEFIK_COMPOSE_ENV: z.string().optional(),
});

export const workerEnvSchema = baseEnvSchema.extend({
  DATABASE_URL: z.string().url(),
  TEMPORAL_ADDRESS: z.string().default("localhost:7233"),
  TEMPORAL_NAMESPACE: z.string().default("default"),
  TEMPORAL_TASK_QUEUE: z.string().default("openbika-control-plane"),

  /** `true`: attach workloads to Docker `OPENBIKA_TRAEFIK_EDGE_NETWORK` + Traefik labels. */
  OPENBIKA_TRAEFIK_ROUTING: z.enum(["true", "false"]).optional(),
  OPENBIKA_PUBLIC_BASE_DOMAIN: z.string().optional(),
  /**
   * When set with `OPENBIKA_INGRESS_PUBLIC_IPV4`, auto hostnames embed that IPv4 in nip.io / sslip.io
   * (alternative to owning `OPENBIKA_PUBLIC_BASE_DOMAIN`).
   */
  OPENBIKA_INGRESS_FREE_DNS_ZONE: z.enum(["nip.io", "sslip.io"]).optional(),
  /**
   * Dotted IPv4 for nip/sslip hostnames; `auto`/empty ⇒ WAN egress probe; **`loopback`** ⇒ `127.0.0.1` for local Docker edge.
   */
  OPENBIKA_INGRESS_PUBLIC_IPV4: z.string().optional(),
  OPENBIKA_TRAEFIK_EDGE_NETWORK: z.string().optional(),
  OPENBIKA_TRAEFIK_CERT_RESOLVER: z.string().optional(),
  /**
   * When nip/sslip is configured, redirects are omitted by default; set `true` to mirror owned-domain HTTPS behavior (recommended only once LE is working).
   */
  OPENBIKA_TRAEFIK_SECURE_INGRESS: z.enum(["true", "false"]).optional(),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  env: NodeJS.ProcessEnv = process.env,
): z.infer<TSchema> {
  return schema.parse(env);
}

export {
  bootstrapIngressIpv4Env,
  detectPublicIngressIpv4,
} from "./ingress-ipv4-bootstrap.js";

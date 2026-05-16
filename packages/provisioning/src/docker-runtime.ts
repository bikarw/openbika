import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

import {
  WORKLOAD_FUNCTION_DEFAULT_LISTEN_PORT,
  normalizeIngressFreeDnsZone,
  normalizeWorkloadIngressPath,
  parseIngressEmbeddedPublicIpv4,
  pruneBlankWorkloadEnv,
  readOmitPlatformHostname,
  readWorkloadIngressDomains,
  suggestWorkloadEmbeddedIpIngressHostname,
  workloadIngressRoutePublicUrl,
  type WorkloadIngressAppliedRoute,
  type WorkloadIngressDomain,
} from "@openbika/contracts";

import {
  buildWorkloadTraefikDockerLabels,
  punyHostname,
  workloadIdToTraefikDnsLabel,
  workloadPublicHostname,
} from "./workload-hostname.js";

/** Bun does not expose `node:child_process/promises`; use promisified `execFile`. */
const execFile = promisify(execFileCallback);

function traefikWorkloadRoutingEnv(): boolean {
  return process.env.OPENBIKA_TRAEFIK_ROUTING === "true";
}

function traefikEdgeNetwork(): string {
  const n = process.env.OPENBIKA_TRAEFIK_EDGE_NETWORK?.trim();
  return n && n.length > 0 ? n : "openbika_edge";
}

function traefikPublicBaseDomain(): string | undefined {
  const d = process.env.OPENBIKA_PUBLIC_BASE_DOMAIN?.trim();
  return d && d.length > 0 ? d : undefined;
}

function traefikCertResolver(): string | undefined {
  const r = process.env.OPENBIKA_TRAEFIK_CERT_RESOLVER?.trim();
  return r && r.length > 0 ? r : undefined;
}

function traefikRedirectsHttpToHttps(): boolean {
  const secure =
    process.env.OPENBIKA_TRAEFIK_SECURE_INGRESS?.trim().toLowerCase();
  if (secure === "true") return true;
  if (secure === "false") return false;

  const rawDnsZone = process.env.OPENBIKA_INGRESS_FREE_DNS_ZONE?.trim();
  if (rawDnsZone) {
    const zone = normalizeIngressFreeDnsZone(rawDnsZone);
    if (zone !== null) return false;
  }

  return true;
}

function traefikWorkloadPlatformHostname(workloadId: string): string {
  const rawDnsZone = process.env.OPENBIKA_INGRESS_FREE_DNS_ZONE?.trim();
  const zone = normalizeIngressFreeDnsZone(rawDnsZone);
  if (rawDnsZone !== undefined && rawDnsZone !== "" && zone === null) {
    throw new Error(
      "OPENBIKA_INGRESS_FREE_DNS_ZONE must be nip.io, sslip.io, or traefik.me (or leave unset).",
    );
  }
  const ip = parseIngressEmbeddedPublicIpv4(
    process.env.OPENBIKA_INGRESS_PUBLIC_IPV4 ?? "",
  );
  if (zone !== null) {
    if (ip === null) {
      throw new Error(
        "OPENBIKA_INGRESS_FREE_DNS_ZONE requires OPENBIKA_INGRESS_PUBLIC_IPV4=<dotted public IPv4> when OPENBIKA_TRAEFIK_ROUTING=true.",
      );
    }
    return suggestWorkloadEmbeddedIpIngressHostname(workloadId, ip, zone);
  }

  const owned = traefikPublicBaseDomain();
  if (!owned || owned.length === 0) {
    throw new Error(
      "Set OPENBIKA_PUBLIC_BASE_DOMAIN (your DNS zone), or OPENBIKA_INGRESS_FREE_DNS_ZONE=nip.io|sslip.io|traefik.me with OPENBIKA_INGRESS_PUBLIC_IPV4, when OPENBIKA_TRAEFIK_ROUTING=true.",
    );
  }

  return workloadPublicHostname(workloadId, owned);
}

export function dockerContainerNameForWorkload(workloadId: string): string {
  return `openbika-wl-${workloadId}`;
}

async function dockerRmF(name: string): Promise<void> {
  try {
    await execFile("docker", ["rm", "-f", name], { maxBuffer: 1024 * 1024 });
  } catch {
    // absent container / race — ignore
  }
}

function readStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === "string") {
      raw[k] = v;
    }
  }
  return pruneBlankWorkloadEnv(raw);
}

export function readWorkloadPublishedPorts(value: unknown): number[] {
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

function execDetail(err: unknown): string {
  let detail = err instanceof Error ? err.message : String(err);
  if (err && typeof err === "object" && "stderr" in err) {
    const s = (err as { stderr?: Buffer }).stderr?.toString().trim();
    if (s) {
      detail = `${detail}: ${s}`;
    }
  }
  return detail;
}

/**
 * Host port Docker chose for a container port (`docker run -p 0:<containerPort>`).
 * Avoids fixed host bindings so concurrent workloads/projects never fight for the same port.
 */
async function dockerHostPortForContainerPort(
  containerRef: string,
  containerPort: number,
): Promise<number> {
  const { stdout } = await execFile(
    "docker",
    ["port", containerRef, `${String(containerPort)}/tcp`],
    { maxBuffer: 1024 * 1024 },
  );
  for (const line of stdout.split("\n")) {
    const m = line.trim().match(/:(\d+)\s*$/);
    if (m) {
      const n = Number(m[1]);
      if (Number.isInteger(n) && n >= 1 && n <= 65535) {
        return n;
      }
    }
  }
  throw new Error(
    `Could not parse host port from: docker port ${containerRef} ${String(containerPort)}/tcp — output: ${stdout.trim()}`,
  );
}

/** Default images when a function omits `source.image` — bundle sources execute user code locally. */
export const DEFAULT_LOCAL_FUNCTION_IMAGE_BUN = "oven/bun:1-alpine";
export const DEFAULT_LOCAL_FUNCTION_IMAGE_NODE = "node:22-alpine";

export function defaultLocalFunctionImageForRuntime(
  runtime: unknown,
): string {
  return runtime === "bun"
    ? DEFAULT_LOCAL_FUNCTION_IMAGE_BUN
    : DEFAULT_LOCAL_FUNCTION_IMAGE_NODE;
}

/** Resolves a pullable image from container `image` or function `source` (image type). */
export function extractDockerImageFromDesiredState(
  desiredState: Record<string, unknown>,
): string | null {
  const direct = desiredState.image;
  if (typeof direct === "string" && direct.trim().length > 0) {
    return direct.trim();
  }

  const source = desiredState.source;
  if (source && typeof source === "object" && !Array.isArray(source)) {
    const rec = source as Record<string, unknown>;
    if (
      rec.type === "image" &&
      typeof rec.image === "string" &&
      rec.image.trim().length > 0
    ) {
      return rec.image.trim();
    }
  }

  return null;
}

export interface LocalDockerRunResult {
  containerId: string;
  containerName: string;
  providerResourceId: string;
  ingressRoutes?: WorkloadIngressAppliedRoute[];
  publicBaseUrl?: string;
}

export interface DockerVolumeBind {
  hostPath: string;
  containerPath: string;
}

export interface DockerRunOptions {
  command?: string[];
  volumeBinds?: DockerVolumeBind[];
  workingDir?: string;
  /** Used to resolve ingress + default listen ports (functions may omit ports). */
  workloadKind?: "container" | "function";
}

export async function runLocalDockerContainer(
  workloadId: string,
  desiredState: Record<string, unknown>,
  options?: DockerRunOptions,
): Promise<LocalDockerRunResult> {
  const image = extractDockerImageFromDesiredState(desiredState);
  if (!image) {
    throw new Error(
      "Local Docker provisioning requires a pullable image (container image, function source.image, or use Bun/Node runtime for defaults).",
    );
  }

  const name = dockerContainerNameForWorkload(workloadId);
  await dockerRmF(name);

  const workloadKind = options?.workloadKind ?? "container";
  const declared = readWorkloadPublishedPorts(desiredState.ports);
  const ports =
    declared.length > 0
      ? declared
      : workloadKind === "function"
        ? [WORKLOAD_FUNCTION_DEFAULT_LISTEN_PORT]
        : [];
  const env = readStringRecord(desiredState.env);

  const traefikIngress = traefikWorkloadRoutingEnv();
  if (traefikIngress && ports.length === 0) {
    throw new Error(
      "Workload desiredState.ports must include at least one container listen port when OPENBIKA_TRAEFIK_ROUTING=true (functions default to their runtime port when omitted).",
    );
  }

  const edgeNetwork = traefikEdgeNetwork();

  const args: string[] = ["run", "-d", "--name", name];

  let traefikIngressRoutes: WorkloadIngressAppliedRoute[] | undefined;

  if (traefikIngress) {
    args.push("--network", edgeNetwork);
    const autoHost = punyHostname(traefikWorkloadPlatformHostname(workloadId));
    const wlSlug = workloadIdToTraefikDnsLabel(workloadId);
    const customs = readWorkloadIngressDomains(desiredState, workloadKind);
    const omitPlatform = readOmitPlatformHostname(desiredState);

    const redirectHttpToHttps = traefikRedirectsHttpToHttps();

    type LabelSpec = {
      basename: string;
      bootstrap: boolean;
      row: WorkloadIngressDomain;
    };

    function matchesPlatformAutoIngress(d: WorkloadIngressDomain): boolean {
      return (
        punyHostname(d.hostname) === autoHost &&
        normalizeWorkloadIngressPath(d.path) === "/" &&
        d.containerPort === ports[0]!
      );
    }

    /** User attached the same nip/platform host/path/port explicitly — omit default platform rows so we never register two routers for one Host(:80). */
    const customsShadowPlatformIngress = customs.some(matchesPlatformAutoIngress);

    /** When the default platform nip row stays, skip customs that duplicate it with https enabled. */
    function customRedundantWithDefaultPlatformHttps(
      d: WorkloadIngressDomain,
    ): boolean {
      return (
        !customsShadowPlatformIngress &&
        matchesPlatformAutoIngress(d) &&
        d.https
      );
    }

    const customsForIngress: WorkloadIngressDomain[] = [];
    for (const d of customs) {
      if (customRedundantWithDefaultPlatformHttps(d)) {
        continue;
      }
      customsForIngress.push(d);
    }

    const labelSpecs: LabelSpec[] = [];
    if (!customsShadowPlatformIngress && !omitPlatform) {
      labelSpecs.push({
        basename: `obl-${wlSlug}`,
        bootstrap: true,
        row: {
          hostname: autoHost,
          containerPort: ports[0]!,
          https: true,
          path: "/",
        },
      });
    }

    let ingressBootstrapOutstanding =
      customsShadowPlatformIngress || omitPlatform;

    for (const d of customsForIngress) {
      const rowKey = `${punyHostname(d.hostname)}|${d.path}|${String(d.containerPort)}|${d.https ? "1" : "0"}`;
      const suffix = createHash("sha256").update(rowKey).digest("hex").slice(0, 10);
      labelSpecs.push({
        basename: `obl-${wlSlug}-r-${suffix}`,
        bootstrap: ingressBootstrapOutstanding,
        row: d,
      });
      ingressBootstrapOutstanding = false;
    }

    const ingressRoutes: WorkloadIngressAppliedRoute[] = [];
    if (!customsShadowPlatformIngress && !omitPlatform) {
      ingressRoutes.push({
        containerPort: ports[0]!,
        hostname: autoHost.toLowerCase(),
        https: redirectHttpToHttps,
        path: "/",
        url: workloadIngressRoutePublicUrl({
          containerPort: ports[0]!,
          hostname: autoHost,
          https: redirectHttpToHttps,
          path: "/",
        }),
      });
    }
    for (const d of customsForIngress) {
      const useHttpsObservedUrl = redirectHttpToHttps && d.https;
      ingressRoutes.push({
        containerPort: d.containerPort,
        hostname: d.hostname.toLowerCase(),
        https: useHttpsObservedUrl,
        path: d.path,
        url: workloadIngressRoutePublicUrl({
          ...d,
          https: useHttpsObservedUrl,
        }),
      });
    }

    for (let i = 0; i < labelSpecs.length; i++) {
      const spec = labelSpecs[i]!;
      const labelLines = buildWorkloadTraefikDockerLabels({
        bootstrap: spec.bootstrap,
        certResolver: traefikCertResolver(),
        containerListenPort: spec.row.containerPort,
        edgeNetwork,
        host: spec.row.hostname,
        https: spec.row.https,
        redirectHttpToHttps: redirectHttpToHttps && spec.row.https,
        pathPrefix: spec.row.path,
        routerBasename: spec.basename,
      });
      for (const line of labelLines) {
        const eq = line.indexOf("=");
        const key = line.slice(0, eq);
        const value = eq >= 0 ? line.slice(eq + 1) : "";
        args.push("--label", `${key}=${value}`);
      }
    }

    traefikIngressRoutes = ingressRoutes;
  } else {
    // Publish container ports on ephemeral host ports (0 = auto-assign) so workloads never
    // collide on the host; `desiredState.ports` remains container-side port numbers.
    for (const p of ports) {
      args.push("-p", `0:${String(p)}`);
    }
  }
  if (options?.volumeBinds) {
    for (const bind of options.volumeBinds) {
      args.push("-v", `${bind.hostPath}:${bind.containerPath}`);
    }
  }
  if (options?.workingDir) {
    args.push("-w", options.workingDir);
  }
  for (const [k, v] of Object.entries(env)) {
    args.push("-e", `${k}=${v}`);
  }
  args.push(image);
  if (options?.command !== undefined && options.command.length > 0) {
    args.push(...options.command);
  }

  try {
    const { stdout } = await execFile("docker", args, {
      maxBuffer: 1024 * 1024,
    });
    const containerId = stdout.trim();
    if (!containerId) {
      throw new Error("docker run returned no container id");
    }

    const providerResourceId = `docker-${containerId.slice(0, 12)}`;
    let publicBaseUrl: string | undefined;
    if (traefikIngress && traefikIngressRoutes && traefikIngressRoutes.length > 0) {
      publicBaseUrl = traefikIngressRoutes[0]?.url;
    } else if (!traefikIngress && ports.length > 0) {
      const containerPort = ports[0]!;
      const hostPort = await dockerHostPortForContainerPort(name, containerPort);
      publicBaseUrl = `http://127.0.0.1:${String(hostPort)}`;
    }

    return {
      containerId,
      containerName: name,
      ...(traefikIngressRoutes ? { ingressRoutes: traefikIngressRoutes } : {}),
      providerResourceId,
      publicBaseUrl,
    };
  } catch (err) {
    throw new Error(`Docker failed to start container: ${execDetail(err)}`);
  }
}

export async function readDockerContainerLogs(
  containerRef: string,
  tail: number,
): Promise<string> {
  const safeTail = Math.min(Math.max(tail, 1), 10_000);
  try {
    const { stdout, stderr } = await execFile(
      "docker",
      [
        "logs",
        "--timestamps",
        `--tail=${String(safeTail)}`,
        containerRef,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    return [stdout, stderr].filter((s) => s.trim().length > 0).join("\n");
  } catch (err) {
    throw new Error(execDetail(err));
  }
}

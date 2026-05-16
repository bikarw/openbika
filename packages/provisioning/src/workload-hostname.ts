import {
  normalizeWorkloadIngressPath,
  suggestWorkloadEdgeHostname,
  workloadIdToEdgeDnsLabel,
} from "@openbika/contracts";

/**
 * Stable HTTP hostnames / Traefik router names for workloads on a public base domain.
 */

/** Crockford-ish ids use `_`; dns host segments must avoid them. */
export function workloadIdToTraefikDnsLabel(workloadId: string): string {
  return workloadIdToEdgeDnsLabel(workloadId);
}

/**
 * Intl / Unicode host segments → ASCII punycode (Traefik-compatible), matching the
 * `new URL('http://${host}').hostname` pattern for ASCII / punycode hostnames.
 */
export function punyHostname(part: string): string {
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

export function workloadPublicHostname(
  workloadId: string,
  publicBaseDomain: string,
): string {
  return suggestWorkloadEdgeHostname(workloadId, publicBaseDomain);
}

/** Stable base URL surfaced in workload observed state (`https://host/`). */
export function workloadHttpsPublicBaseUrl(hostname: string): string {
  const h =
    punyHostname(hostname.split("/")[0]?.replace(/^https?:\/\//i, "") ?? hostname);
  return `https://${h}/`;
}

export interface BuildTraefikDockerLabelsInput {
  edgeNetwork: string;
  /** Full host, e.g. `wkl-xxx.runs.example.com` */
  host: string;
  containerListenPort: number;
  certResolver?: string;
  /** Basename matching `*-web` / `*-websecure` routers; keep short-ish for label keys. */
  routerBasename: string;
  /** First row on the container emits `traefik.enable` / `traefik.docker.network`. */
  bootstrap?: boolean;
  /** When false: single `web` router (no HTTPS / cert resolver rows). Default true. */
  https?: boolean;
  /** When HTTPS rows are used and this is false, `web` serves HTTP without redirecting to `websecure`. Default true when omitted. */
  redirectHttpToHttps?: boolean;
  /** PathPrefix; `/` yields a Host()-only matcher. */
  pathPrefix?: string;
}

/** Traefik labels appended to `docker run` for host, path, port, and TLS. */
export function buildWorkloadTraefikDockerLabels(
  input: BuildTraefikDockerLabelsInput,
): string[] {
  const resolver = input.certResolver?.trim() || "letsencrypt";
  const host = punyHostname(input.host);
  const pathNorm = normalizeWorkloadIngressPath(input.pathPrefix ?? "/");
  let rule = `Host(\`${host}\`)`;
  if (pathNorm !== "/") {
    rule = `${rule} && PathPrefix(\`${pathNorm}\`)`;
  }

  const web = `${input.routerBasename}-web`;
  const websecure = `${input.routerBasename}-websecure`;
  const useHttps = input.https !== false;
  const redirectHttpToHttps = input.redirectHttpToHttps !== false;

  const lines: string[] = [];
  if (input.bootstrap) {
    lines.push("traefik.enable=true", `traefik.docker.network=${input.edgeNetwork}`);
  }

  if (!useHttps) {
    lines.push(
      `traefik.http.routers.${web}.rule=${rule}`,
      `traefik.http.routers.${web}.entrypoints=web`,
      `traefik.http.routers.${web}.service=${web}`,
      `traefik.http.services.${web}.loadbalancer.server.port=${String(
        input.containerListenPort,
      )}`,
    );
    return lines;
  }

  lines.push(
    `traefik.http.routers.${web}.rule=${rule}`,
    `traefik.http.routers.${web}.entrypoints=web`,
    ...(redirectHttpToHttps
      ? ([
          `traefik.http.routers.${web}.middlewares=redirect-to-https@file`,
        ] as const)
      : []),
    `traefik.http.routers.${web}.service=${web}`,
    `traefik.http.services.${web}.loadbalancer.server.port=${String(
      input.containerListenPort,
    )}`,

    `traefik.http.routers.${websecure}.rule=${rule}`,
    `traefik.http.routers.${websecure}.entrypoints=websecure`,
    `traefik.http.routers.${websecure}.tls.certresolver=${resolver}`,
    `traefik.http.routers.${websecure}.service=${websecure}`,
    `traefik.http.services.${websecure}.loadbalancer.server.port=${String(
      input.containerListenPort,
    )}`,
  );

  return lines;
}

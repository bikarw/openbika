const IPV4_DOTTED_RE =
  /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function ingressConfiguredZone(
  raw: string | undefined,
): "nip.io" | "sslip.io" | "traefik.me" | null {
  const z = raw?.trim().toLowerCase();
  return z === "nip.io" || z === "sslip.io" || z === "traefik.me" ? z : null;
}

function sanitizeDottedIpv4(candidate: string): string | null {
  const ip = candidate.trim();
  return IPV4_DOTTED_RE.test(ip) ? ip : null;
}

/**
 * Looks up this host's public egress IPv4 (for embedded-IP free DNS names).
 */
export async function detectPublicIngressIpv4(options?: {
  timeoutMs?: number;
}): Promise<string | null> {
  const timeoutMs = options?.timeoutMs ?? 4500;

  async function probeText(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "text/plain",
          "User-Agent": "openbika-ingress/1",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        return null;
      }
      const txt = sanitizeDottedIpv4(await res.text());
      return txt;
    } catch {
      return null;
    }
  }

  async function probeIpify(): Promise<string | null> {
    try {
      const res = await fetch("https://api.ipify.org?format=json", {
        headers: { "User-Agent": "openbika-ingress/1" },
        redirect: "follow",
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        return null;
      }
      const body = (await res.json()) as { ip?: unknown };
      const raw = typeof body.ip === "string" ? body.ip : "";
      return sanitizeDottedIpv4(raw);
    } catch {
      return null;
    }
  }

  return (
    (await probeText("https://api4.ipify.org")) ??
    (await probeText("https://ipv4.ident.me/")) ??
    (await probeIpify())
  );
}

/**
 * Mutates env (usually `process.env`).
 * When free DNS is configured and IPv4 is empty or literal `auto`, discovers the egress IPv4
 * once at startup so VPS installs avoid hand-editing IPs.
 */
export async function bootstrapIngressIpv4Env(
  envObj: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const zone = ingressConfiguredZone(envObj.OPENBIKA_INGRESS_FREE_DNS_ZONE);
  if (zone === null) {
    return;
  }

  const raw = envObj.OPENBIKA_INGRESS_PUBLIC_IPV4?.trim() ?? "";

  /** Local laptop: hostnames embed 127.0.0.1 — clients resolve that to their own machine, not your server. */
  if (/^loopback$/i.test(raw)) {
    envObj.OPENBIKA_INGRESS_PUBLIC_IPV4 = "127.0.0.1";
    console.info(
      `[openbika] OPENBIKA_INGRESS_FREE_DNS_ZONE=${zone}: loopback → 127.0.0.1 (Docker Traefik on this host only)`,
    );
    if (envObj.NODE_ENV === "production") {
      console.warn(
        "[openbika] free-DNS ingress with loopback is not publicly reachable; set OPENBIKA_INGRESS_PUBLIC_IPV4=auto or your routable IPv4.",
      );
    }
    return;
  }

  const wantsDiscover = raw === "" || /^auto$/i.test(raw);
  if (!wantsDiscover) {
    if (sanitizeDottedIpv4(raw) === null) {
      console.warn(
        `[openbika] OPENBIKA_INGRESS_PUBLIC_IPV4="${raw}" is not a dotted IPv4; fix it or set to auto.`,
      );
    }
    return;
  }

  const ip = await detectPublicIngressIpv4();
  if (ip !== null) {
    envObj.OPENBIKA_INGRESS_PUBLIC_IPV4 = ip;
    console.info(
      `[openbika] OPENBIKA_INGRESS_FREE_DNS_ZONE=${zone}: autodetected public IPv4 ${ip}`,
    );
    return;
  }

  console.warn(
    "[openbika] Could not autodiscover public IPv4 for free-DNS ingress — set OPENBIKA_INGRESS_PUBLIC_IPV4 to this host's routable IPv4.",
  );
}

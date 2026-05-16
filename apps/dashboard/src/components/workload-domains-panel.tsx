import {
  MAX_WORKLOAD_INGRESS_DOMAINS,
  normalizeWorkloadCustomHostname,
  normalizeWorkloadIngressPath,
  readObservedWorkloadIngressRoutes,
  readWorkloadIngressDomains,
  resolveWorkloadEffectiveListenPorts,
  suggestWorkloadEdgeHostname,
  suggestWorkloadEmbeddedIpIngressHostname,
  workloadIngressDedupeKey,
  workloadIngressRoutePublicUrl,
  type WorkloadIngressDomain,
  type WorkloadResponse,
} from "@openbika/contracts";
import { Button } from "@openbika/ui/components/button";
import { cn } from "@openbika/ui/lib/utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@openbika/ui/components/card";
import { Input } from "@openbika/ui/components/input";
import { Copy, Dices, ExternalLink, Plus, Trash2, X } from "lucide-react";
import * as React from "react";

import { useMutation } from "@tanstack/react-query";

import { useProjectWorkspaceOutlet } from "#/components/project-workspace";
import { workloadObservedPublicBaseUrl } from "#/components/workloads-panel";
import { patchWorkloadDomainsRequest } from "#/lib/dashboard-api-queries";

interface WorkloadDomainsPanelProps {
  workloadId: string;
}

function isLocalIngressUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".local.openbika.test")
  );
}

function certShortLabelForHref(href: string): string {
  try {
    const u = new URL(href.includes("://") ? href : `https://${href}`);
    if (u.protocol !== "https:") {
      return "HTTP";
    }
    if (isLocalIngressUrl(u)) {
      return "Local";
    }
    return "TLS";
  } catch {
    return "—";
  }
}

function workloadKindPort(workloadKind: string): "container" | "function" {
  return workloadKind === "function" ? "function" : "container";
}

function randomDnsSlug(): string {
  const u = new Uint8Array(4);
  crypto.getRandomValues(u);
  const hex = Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
  return `r-${hex}`;
}

/** Random label + same edge IP/zone or base domain as the platform hint (not tied to workload id). */
function randomTraefikHostname(workload: WorkloadResponse): string | null {
  const e = workload.edge;
  if (!e) {
    return null;
  }
  const slug = randomDnsSlug();
  try {
    if (e.embeddedPublicIpv4 && e.freeDnsZone) {
      return suggestWorkloadEmbeddedIpIngressHostname(
        slug,
        e.embeddedPublicIpv4,
        e.freeDnsZone,
      );
    }
    const base = e.publicBaseDomain?.trim();
    if (base) {
      return suggestWorkloadEdgeHostname(slug, base);
    }
  } catch {
    return null;
  }
  return null;
}

function canGenerateRandomEdgeHostname(
  workload: WorkloadResponse | null,
): boolean {
  const e = workload?.edge;
  if (!e) {
    return false;
  }
  if (e.embeddedPublicIpv4 && e.freeDnsZone) {
    return true;
  }
  return Boolean(e.publicBaseDomain?.trim());
}

type DomainRow = {
  backing?: WorkloadIngressDomain;
  certShort: string;
  href: string;
  hostname: string;
  https: boolean;
  id: string;
  path: string;
  port: number | null;
};

export function WorkloadDomainsPanel({ workloadId }: WorkloadDomainsPanelProps) {
  const { workloads, refreshWorkloads } = useProjectWorkspaceOutlet();
  const workload = workloads.find((w) => w.id === workloadId) ?? null;

  const patchDomainsMut = useMutation({
    mutationFn: (vars: {
      domains: WorkloadIngressDomain[];
      omitPlatformHostname?: boolean;
    }) =>
      patchWorkloadDomainsRequest(workloadId, {
        domains: vars.domains,
        ...(vars.omitPlatformHostname === true
          ? { omitPlatformHostname: true }
          : {}),
      }),
    onSuccess: () => {
      void refreshWorkloads();
    },
  });

  const [copiedIdx, setCopiedIdx] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [draftHost, setDraftHost] = React.useState("");
  const [draftPath, setDraftPath] = React.useState("/");
  const [draftPort, setDraftPort] = React.useState("");
  const [draftHttps, setDraftHttps] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const kind = workload ? workloadKindPort(workload.kind) : "container";

  const declaredPorts = React.useMemo(
    () =>
      workload
        ? resolveWorkloadEffectiveListenPorts(
            workload.desiredState as Record<string, unknown>,
            kind,
          )
        : [],
    [workload, kind],
  );

  const portKey = declaredPorts.join(",");

  React.useEffect(() => setDraftHost(""), [workloadId]);
  React.useEffect(() => setCopiedIdx(null), [workload?.updatedAt]);

  function syncDraftPortFromWorkload() {
    const first = declaredPorts[0];
    if (first !== undefined) {
      setDraftPort(String(first));
    } else {
      setDraftPort("");
    }
  }

  React.useEffect(() => {
    syncDraftPortFromWorkload();
  }, [workloadId, portKey]);

  React.useEffect(() => {
    if (!addOpen) {
      return;
    }
    syncDraftPortFromWorkload();
    setErrorMessage(null);
  }, [addOpen, workloadId, portKey]);

  React.useEffect(() => {
    if (!addOpen) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAddOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [addOpen]);

  const desiredDomains = React.useMemo(
    () =>
      workload
        ? readWorkloadIngressDomains(
            workload.desiredState as Record<string, unknown>,
            kind,
          )
        : [],
    [workload, kind],
  );

  const observedRoutes = React.useMemo(
    () =>
      workload
        ? readObservedWorkloadIngressRoutes(
            workload.observedState as Record<string, unknown>,
          )
        : [],
    [workload],
  );

  const rows = React.useMemo((): DomainRow[] => {
    if (!workload) {
      return [];
    }
    const seen = new Set<string>();
    const out: DomainRow[] = [];

    for (const r of observedRoutes) {
      const k = workloadIngressDedupeKey(r);
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      const matchDesired = desiredDomains.find(
        (d) => workloadIngressDedupeKey(d) === k,
      );
      out.push({
        backing: matchDesired,
        certShort: certShortLabelForHref(r.url),
        hostname: r.hostname,
        href: r.url,
        https: r.https,
        id: `obs:${k}`,
        path: r.path,
        port: r.containerPort,
      });
    }

    if (out.length === 0) {
      const primary = workloadObservedPublicBaseUrl(workload);
      if (primary) {
        const p0 = declaredPorts[0] ?? null;
        out.push({
          certShort: certShortLabelForHref(primary),
          hostname: (() => {
            try {
              return new URL(
                primary.includes("://") ? primary : `https://${primary}`,
              ).host;
            } catch {
              return primary;
            }
          })(),
          href: primary,
          https: primary.trim().toLowerCase().startsWith("https:"),
          id: "legacy-url",
          path: "/",
          port: p0,
        });
      }
    }

    for (const d of desiredDomains) {
      const k = workloadIngressDedupeKey(d);
      if (seen.has(k)) {
        continue;
      }
      seen.add(k);
      const href = workloadIngressRoutePublicUrl(d);
      out.push({
        backing: d,
        certShort: certShortLabelForHref(href),
        hostname: d.hostname,
        href,
        https: d.https,
        id: `desired:${k}`,
        path: d.path,
        port: d.containerPort,
      });
    }

    return out;
  }, [declaredPorts, desiredDomains, observedRoutes, workload]);

  const busy = patchDomainsMut.isPending || workload?.status === "provisioning";

  const atDomainLimit =
    desiredDomains.length >= MAX_WORKLOAD_INGRESS_DOMAINS;
  const canAddDomain = declaredPorts.length > 0 && !atDomainLimit;

  function openAddModal() {
    setDraftHost("");
    setDraftPath("/");
    setDraftHttps(true);
    setErrorMessage(null);
    syncDraftPortFromWorkload();
    setAddOpen(true);
  }

  async function copyText(value: string, rowKey: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIdx(rowKey);
      window.setTimeout(() => setCopiedIdx((c) => (c === rowKey ? null : c)), 2000);
    } catch {
      setCopiedIdx(null);
    }
  }

  async function persistDomains(
    next: WorkloadIngressDomain[],
    options?: { omitPlatformHostname?: boolean },
  ) {
    if (!workload) {
      return;
    }
    setErrorMessage(null);
    try {
      await patchDomainsMut.mutateAsync({
        domains: next,
        omitPlatformHostname: options?.omitPlatformHostname,
      });
      setDraftHost("");
      setDraftPath("/");
      setDraftHttps(true);
      setAddOpen(false);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Unable to save ingress domains.",
      );
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!workload) {
      return;
    }
    setErrorMessage(null);

    if (declaredPorts.length === 0) {
      setErrorMessage(
        kind === "container"
          ? "Declare container ports on this workload first."
          : "No listen port for this function.",
      );
      return;
    }

    let normalizedHost: string;
    try {
      normalizedHost = normalizeWorkloadCustomHostname(draftHost);
    } catch {
      setErrorMessage("Invalid hostname.");
      return;
    }

    const portNum = Number(draftPort);
    if (!Number.isInteger(portNum) || !declaredPorts.includes(portNum)) {
      setErrorMessage("Pick a declared container port.");
      return;
    }

    let pathNorm: string;
    try {
      pathNorm = normalizeWorkloadIngressPath(draftPath || "/");
    } catch {
      setErrorMessage("Invalid path.");
      return;
    }

    const entry: WorkloadIngressDomain = {
      containerPort: portNum,
      hostname: normalizedHost,
      https: draftHttps,
      path: pathNorm,
    };

    const key = workloadIngressDedupeKey(entry);
    if (desiredDomains.some((d) => workloadIngressDedupeKey(d) === key)) {
      setErrorMessage("That route is already attached.");
      return;
    }

    if (desiredDomains.length >= MAX_WORKLOAD_INGRESS_DOMAINS) {
      setErrorMessage(
        `At most ${String(MAX_WORKLOAD_INGRESS_DOMAINS)} custom hostnames.`,
      );
      return;
    }

    await persistDomains([...desiredDomains, entry]);
  }

  async function removeRow(row: DomainRow) {
    if (!workload) {
      return;
    }
    if (row.backing) {
      const next = desiredDomains.filter(
        (d) =>
          workloadIngressDedupeKey(d) !== workloadIngressDedupeKey(row.backing!),
      );
      await persistDomains(next);
      return;
    }
    await persistDomains(desiredDomains, { omitPlatformHostname: true });
  }

  if (!workload) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Domains</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Workload not loaded.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base font-medium tracking-tight">
            Domains
          </CardTitle>
          <Button
            disabled={busy || !canAddDomain}
            onClick={() => openAddModal()}
            size="sm"
            type="button"
            title={
              atDomainLimit
                ? `Limit ${String(MAX_WORKLOAD_INGRESS_DOMAINS)} custom hostnames`
                : declaredPorts.length === 0
                  ? "Declare workload ports first"
                  : undefined
            }
          >
            <Plus className="size-4 opacity-90" aria-hidden />
            Add domain
          </Button>
        </CardHeader>
        <CardContent className="space-y-5">
          {busy && workload.status === "provisioning" ? (
            <p className="text-muted-foreground text-sm">Updating routes…</p>
          ) : null}

          {rows.length > 0 ? (
            <ul className="divide-y overflow-hidden rounded-md border">
              {rows.map((row) => (
                <li key={row.id}>
                  <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                    <div className="min-w-0 flex-1 space-y-1">
                      <a
                        className="break-all font-mono text-foreground text-sm leading-snug underline-offset-4 hover:underline"
                        href={row.href}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {row.href}
                      </a>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground text-xs">
                        <span>
                          Port{" "}
                          {row.port !== null && row.port > 0 ? row.port : "—"}
                        </span>
                        <span>{row.path === "/" ? "/" : row.path}</span>
                        <span>{row.https ? "HTTPS" : "HTTP"}</span>
                        <span>{row.certShort}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        aria-label="Copy URL"
                        disabled={busy}
                        onClick={() => void copyText(row.href, row.id)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Copy className="size-4 opacity-70" aria-hidden />
                      </Button>
                      <Button
                        aria-label="Open URL"
                        disabled={busy}
                        onClick={() => {
                          if (!busy) {
                            window.open(
                              row.href,
                              "_blank",
                              "noopener,noreferrer",
                            );
                          }
                        }}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <ExternalLink
                          className="size-4 opacity-70"
                          aria-hidden
                        />
                      </Button>
                      <Button
                        aria-label="Remove hostname"
                        disabled={busy}
                        onClick={() => void removeRow(row)}
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2
                          className="size-4 text-destructive opacity-90"
                          aria-hidden
                        />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">No routes yet.</p>
          )}

          {errorMessage && !addOpen ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {addOpen ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 text-left backdrop-blur-sm"
          role="dialog"
          onClick={() => !busy && setAddOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-border border-b p-4">
              <div>
                <h2 className="font-semibold text-lg tracking-tight">
                  Add domain
                </h2>
                <p className="text-muted-foreground text-sm">
                  Hostname, port, path, and scheme for Traefik.
                </p>
              </div>
              <Button
                aria-label="Close"
                disabled={busy}
                onClick={() => setAddOpen(false)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <X className="size-4" />
              </Button>
            </div>

            <form className="space-y-4 p-4" onSubmit={(ev) => void handleAdd(ev)}>
              <div className="space-y-2">
                <p className="font-medium text-sm">Hostname</p>
                <div className="flex gap-2">
                  <Input
                    aria-label="Hostname"
                    autoComplete="off"
                    autoFocus
                    className="min-w-0 flex-1 font-mono text-sm"
                    disabled={busy || declaredPorts.length === 0}
                    placeholder="app.example.com"
                    spellCheck={false}
                    value={draftHost}
                    onChange={(ev) => setDraftHost(ev.target.value)}
                  />
                  <Button
                    disabled={
                      busy ||
                      declaredPorts.length === 0 ||
                      !canGenerateRandomEdgeHostname(workload)
                    }
                    onClick={() => {
                      const h = randomTraefikHostname(workload!);
                      if (h) {
                        setDraftHost(h);
                        setErrorMessage(null);
                      }
                    }}
                    title={
                      canGenerateRandomEdgeHostname(workload)
                        ? "New random hostname on the platform edge."
                        : "Configure API edge (nip/sslip or OPENBIKA_PUBLIC_BASE_DOMAIN)."
                    }
                    type="button"
                    variant="outline"
                  >
                    <Dices className="size-4 opacity-80" aria-hidden />
                    Random
                  </Button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="font-medium text-sm">Container port</p>
                  <select
                    aria-label="Container port"
                    className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                    disabled={busy || declaredPorts.length === 0}
                    value={draftPort}
                    onChange={(ev) => setDraftPort(ev.target.value)}
                  >
                    {declaredPorts.map((p) => (
                      <option key={p} value={String(p)}>
                        {String(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-sm">Path prefix</p>
                  <Input
                    aria-label="Path prefix"
                    autoComplete="off"
                    className="font-mono text-sm"
                    disabled={busy || declaredPorts.length === 0}
                    placeholder="/"
                    spellCheck={false}
                    value={draftPath}
                    onChange={(ev) => setDraftPath(ev.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <p className="font-medium text-sm">Scheme</p>
                <div
                  className="flex rounded-md border border-input p-1"
                  role="group"
                  aria-label="HTTP or HTTPS"
                >
                  <button
                    className={cn(
                      "flex-1 rounded-sm py-2 text-center text-sm transition-colors",
                      !draftHttps
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    disabled={busy || declaredPorts.length === 0}
                    type="button"
                    onClick={() => setDraftHttps(false)}
                  >
                    HTTP
                  </button>
                  <button
                    className={cn(
                      "flex-1 rounded-sm py-2 text-center text-sm transition-colors",
                      draftHttps
                        ? "bg-background font-medium text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    disabled={busy || declaredPorts.length === 0}
                    type="button"
                    onClick={() => setDraftHttps(true)}
                  >
                    HTTPS
                  </button>
                </div>
                <p className="text-muted-foreground text-xs">
                  HTTPS enables TLS in Traefik (e.g. Let’s Encrypt when
                  configured). Use HTTP for local plaintext routes.
                </p>
              </div>

              {errorMessage ? (
                <p className="text-destructive text-sm" role="alert">
                  {errorMessage}
                </p>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2 border-border border-t pt-4">
                <Button
                  disabled={busy}
                  onClick={() => setAddOpen(false)}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
                <Button
                  disabled={
                    busy ||
                    draftHost.trim().length === 0 ||
                    declaredPorts.length === 0 ||
                    atDomainLimit
                  }
                  type="submit"
                >
                  {patchDomainsMut.isPending ? "Saving…" : "Add domain"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

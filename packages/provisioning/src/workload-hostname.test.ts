import { describe, expect, it } from "vitest";

import { suggestWorkloadEmbeddedIpIngressHostname } from "@openbika/contracts";

import {
  buildWorkloadTraefikDockerLabels,
  punyHostname,
  workloadHttpsPublicBaseUrl,
  workloadIdToTraefikDnsLabel,
  workloadPublicHostname,
} from "./workload-hostname.js";

describe("workload-hostname helpers", () => {
  it("maps OpenBika ids into DNS-ish labels", () => {
    expect(workloadIdToTraefikDnsLabel("wkl_01HZTESTULIDEXAMPLEABCDEF")).toBe(
      "wkl-01hztestulidexampleabcdef",
    );
  });

  it("builds fqdn hosts", () => {
    expect(workloadPublicHostname("wkl_01HZTESTEXAMPLE", "runs.example.dev")).toBe(
      "wkl-01hztestexample.runs.example.dev",
    );
  });

  it("returns https base urls", () => {
    expect(
      workloadHttpsPublicBaseUrl(workloadPublicHostname("wkl_A", "x.test")),
    ).toBe("https://wkl-a.x.test/");
  });

  it("punyHostname strips schemes and paths", () => {
    expect(punyHostname("  https://host.example/path  ")).toBe("host.example");
  });

  it("creates traefik docker labels for HTTPS ingress", () => {
    const labels = buildWorkloadTraefikDockerLabels({
      bootstrap: true,
      routerBasename: "obl-test",
      host: "fn.example.dev",
      containerListenPort: 9100,
      edgeNetwork: "openbika_edge",
      certResolver: "letsencrypt",
    });
    const map = Object.fromEntries(
      labels.map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)] as const;
      }),
    );
    expect(map["traefik.enable"]).toBe("true");
    expect(map["traefik.docker.network"]).toBe("openbika_edge");
    expect(map["traefik.http.services.obl-test-web.loadbalancer.server.port"]).toBe(
      "9100",
    );
    expect(map["traefik.http.services.obl-test-websecure.loadbalancer.server.port"]).toBe(
      "9100",
    );
    expect(map["traefik.http.routers.obl-test-websecure.tls.certresolver"]).toBe(
      "letsencrypt",
    );
    expect(map["traefik.http.routers.obl-test-web.rule"]).toBe(
      "Host(`fn.example.dev`)",
    );
    expect(map["traefik.http.routers.obl-test-web.middlewares"]).toBe(
      "redirect-to-https@file",
    );
  });

  it("HTTPS without HTTP→HTTPS redirect omits middleware (nip/bootstrap)", () => {
    const labels = buildWorkloadTraefikDockerLabels({
      bootstrap: false,
      certResolver: "letsencrypt",
      containerListenPort: 9100,
      edgeNetwork: "openbika_edge",
      host: "app.203.0.113.54.nip.io",
      routerBasename: "obl-nip",
      redirectHttpToHttps: false,
    });
    expect(labels.some((l) => l.includes("middlewares"))).toBe(false);
    expect(labels.some((l) => l.includes("websecure"))).toBe(true);
  });

  it("adds PathPrefix for routed paths", () => {
    const labels = buildWorkloadTraefikDockerLabels({
      bootstrap: true,
      certResolver: "letsencrypt",
      containerListenPort: 3000,
      edgeNetwork: "openbika_edge",
      host: "app.example.dev",
      pathPrefix: "/api/v1",
      routerBasename: "obl-path",
    });
    const raw = labels.find((l) =>
      l.startsWith("traefik.http.routers.obl-path-web.rule="),
    );
    const eq = raw?.indexOf("=") ?? -1;
    const rule = eq >= 0 && raw !== undefined ? raw.slice(eq + 1) : undefined;
    expect(rule).toBe(
      "Host(`app.example.dev`) && PathPrefix(`/api/v1`)",
    );
  });

  it("builds nip.io hostnames embedding public IPv4", () => {
    expect(
      suggestWorkloadEmbeddedIpIngressHostname(
        "wkl_01HZTESTEXAMPLE",
        "203.0.113.54",
        "nip.io",
      ),
    ).toBe("wkl-01hztestexample.203.0.113.54.nip.io");
  });

  it("builds sslip.io hostnames with dashed IPv4 in one label", () => {
    expect(
      suggestWorkloadEmbeddedIpIngressHostname("wkl_A", "198.51.100.2", "sslip.io"),
    ).toBe("wkl-a-198-51-100-2.sslip.io");
  });

  it("plaintext mode uses only the web entrypoint", () => {
    const labels = buildWorkloadTraefikDockerLabels({
      bootstrap: false,
      containerListenPort: 9100,
      edgeNetwork: "openbika_edge",
      host: "plain.dev",
      https: false,
      routerBasename: "obl-http",
    });
    expect(labels.some((l) => l.includes("websecure"))).toBe(false);
    expect(
      labels.find((l) => l.includes("middlewares")),
    ).toBeUndefined();
  });
});

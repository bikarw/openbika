import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { dockerContainerNameForWorkload } from "./docker-runtime.js";
import {
  decodeDataUriToBuffer,
  runLocalBundledFunction,
  stagingDirForWorkload,
} from "./local-function-bundle.js";

const skipDocker = process.env.SKIP_DOCKER === "1";

function dockerDaemonReachable(): boolean {
  try {
    execFileSync("docker", ["info"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const describeIntegration =
  skipDocker || !dockerDaemonReachable() ? describe.skip : describe;

describeIntegration("local bundled Bun function via Docker", () => {
  const workloadId = "wkl_integrationfn01";

  async function finalizeContainer(): Promise<void> {
    try {
      execFileSync(
        "docker",
        ["rm", "-f", dockerContainerNameForWorkload(workloadId)],
        { stdio: "pipe" },
      );
    } catch {
      // ignore teardown races
    }
  }

  afterAll(async () => {
    await finalizeContainer();
    rmSync(stagingDirForWorkload(workloadId), { recursive: true, force: true });
  });

  function buildZipArtifact(): Buffer {
    const fixture = fileURLToPath(
      new URL("../test/fixtures/bun-fn-port3000", import.meta.url),
    );
    const zdir = mkdtempSync(join(tmpdir(), "openbika-fnzip-"));
    const zipPath = join(zdir, "bundle.zip");
    execFileSync("zip", ["-r", zipPath, "."], {
      cwd: fixture,
      stdio: "pipe",
      maxBuffer: 16 * 1024 * 1024,
    });
    const zip = readFileSync(zipPath);
    rmSync(zdir, { recursive: true, force: true });
    return zip;
  }

  function toDataZipUri(zip: Buffer): string {
    return `data:application/zip;base64,${zip.toString("base64")}`;
  }

  it("exposes inbound port even when code binds 3000", async () => {
    await finalizeContainer();

    const zip = buildZipArtifact();
    const artifactUri = toDataZipUri(zip);

    const desiredState: Record<string, unknown> = {
      entrypoint: "index.ts",
      runtime: "bun",
      source: { artifactUri, type: "bundle" },
    };

    const result = await runLocalBundledFunction(workloadId, desiredState);
    expect(result.publicBaseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const base = result.publicBaseUrl!;
    let res: Response | undefined;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 40; attempt++) {
      try {
        const tryRes = await fetch(`${base}/`);
        if (!tryRes.ok) {
          lastErr = new Error(`HTTP ${String(tryRes.status)}`);
        } else {
          res = tryRes;
          break;
        }
      } catch (err) {
        lastErr = err;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 150));
    }

    expect(res, `upstream never became reachable: ${String(lastErr)}`).toBeTruthy();
    expect(res!.ok).toBe(true);
    await expect(res!.json()).resolves.toMatchObject({ ok: true });

    await finalizeContainer();
  }, 120_000);

  it("decodeDataUriToBuffer parses dashboard-style zip payloads", () => {
    const dir = mkdtempSync(join(tmpdir(), "openbika-datauri-"));
    try {
      const artifact = join(dir, "one.zip");
      writeFileSync(artifact, buildZipArtifact());
      const uri = `data:application/zip;base64,${readFileSync(artifact).toString("base64")}`;
      const roundTrip = decodeDataUriToBuffer(uri);
      expect(roundTrip.slice(0, 2).toString("latin1")).toBe("PK");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

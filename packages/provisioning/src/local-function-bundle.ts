import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { pruneBlankWorkloadEnv } from "@openbika/contracts";

import {
  type DockerVolumeBind,
  extractDockerImageFromDesiredState,
  readWorkloadPublishedPorts,
  runLocalDockerContainer,
  type LocalDockerRunResult,
} from "./docker-runtime.js";

function readEnvRecord(
  desiredState: Record<string, unknown>,
): Record<string, string> {
  const env = desiredState.env;
  if (!env || typeof env !== "object" || Array.isArray(env)) {
    return {};
  }
  const raw: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string") {
      raw[k] = v;
    }
  }
  return pruneBlankWorkloadEnv(raw);
}

function sanitizeWorkloadPathSegment(workloadId: string): string {
  return workloadId.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function defaultFunctionStagingRoot(): string {
  const fromEnv = process.env.OPENBIKA_LOCAL_FN_STAGING_ROOT;
  if (typeof fromEnv === "string" && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return join(homedir(), ".cache", "openbika", "local-fn");
}

export function stagingDirForWorkload(workloadId: string): string {
  return join(
    defaultFunctionStagingRoot(),
    sanitizeWorkloadPathSegment(workloadId),
  );
}

function decodePercentEncoded(data: string): Buffer {
  return Buffer.from(decodeURIComponent(data), "latin1");
}

export function decodeDataUriToBuffer(dataUri: string): Buffer {
  const comma = dataUri.indexOf(",");
  if (comma === -1 || !dataUri.toLowerCase().startsWith("data:")) {
    throw new Error(
      `Bundle artifact is not a data: URI (expected dashboard upload or data URL). Got: ${dataUri.slice(0, 64)}…`,
    );
  }

  const header = dataUri.slice(5, comma);
  const payload = dataUri.slice(comma + 1);
  const base64 = /\bbase64\b/i.test(header) || /;base64$/i.test(header);

  if (base64) {
    return Buffer.from(payload.replace(/\s+/g, ""), "base64");
  }
  try {
    return decodePercentEncoded(payload);
  } catch {
    return Buffer.from(payload, "utf8");
  }
}

function isGzipTar(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function isZip(buf: Buffer): boolean {
  return (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    buf[3] !== undefined &&
    buf[2] !== undefined &&
    (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07) &&
    (buf[3] === 0x04 || buf[3] === 0x06 || buf[3] === 0x08)
  );
}

function hoistIfSingleNestedRoot(extractRoot: string): void {
  const entries = readdirSync(extractRoot).filter(
    (entry) => !entry.startsWith("."),
  );
  if (entries.length !== 1) {
    return;
  }

  const nested = join(extractRoot, entries[0]!);
  if (!statSync(nested).isDirectory()) {
    return;
  }

  for (const name of readdirSync(nested)) {
    renameSync(join(nested, name), join(extractRoot, name));
  }
  rmSync(nested, { recursive: true, force: true });
}

function extractArchive(bundleFile: string, outDir: string): void {
  const head = Buffer.allocUnsafe(512);
  let fd = -1;
  try {
    fd = openSync(bundleFile, "r");
    readSync(fd, head, 0, 512, 0);
  } finally {
    if (fd !== -1) {
      closeSync(fd);
    }
  }

  if (isZip(head)) {
    mkdirSync(outDir, { recursive: true });
    const unzip = spawnSync("unzip", ["-qq", "-o", bundleFile, "-d", outDir], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (unzip.status !== 0) {
      throw new Error(
        `Unable to unzip function bundle (${unzip.status ?? "?"})${unzip.stderr ? `: ${unzip.stderr}` : ""}`,
      );
    }
    return;
  }

  if (isGzipTar(head)) {
    mkdirSync(outDir, { recursive: true });
    const tar = spawnSync("tar", ["-xzf", bundleFile, "-C", outDir], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (tar.status !== 0) {
      throw new Error(
        `Unable to extract tar.gz function bundle (${tar.status ?? "?"})${tar.stderr ? `: ${tar.stderr}` : ""}`,
      );
    }
    return;
  }

  throw new Error(
    "Unsupported function bundle archive (need .zip from the dashboard or a tar.gz artifact).",
  );
}

function copyLauncher(runtime: "bun" | "node", openbikaDir: string): void {
  mkdirSync(openbikaDir, { recursive: true });
  const templateRoot = fileURLToPath(new URL("../templates", import.meta.url));
  if (runtime === "bun") {
    const src = join(templateRoot, "function-launcher.bun.ts");
    const dst = join(openbikaDir, "function-launcher.bun.ts");
    writeFileSync(dst, readFileSync(src));
    return;
  }
  const src = join(templateRoot, "function-launcher.node.mjs");
  const dst = join(openbikaDir, "function-launcher.node.mjs");
  writeFileSync(dst, readFileSync(src));
}

async function artifactBytes(uri: string): Promise<Buffer> {
  const trimmed = uri.trim();
  if (trimmed.toLowerCase().startsWith("data:")) {
    return decodeDataUriToBuffer(trimmed);
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed);
    if (!res.ok) {
      throw new Error(`Failed to download bundle (${res.status}): ${trimmed}`);
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  let pathFs = trimmed;
  if (pathFs.startsWith("file://")) {
    pathFs = decodeURI(pathFs.slice("file://".length));
  }
  if (
    (/^[\\/]/.test(pathFs) ||
      (/^[a-zA-Z]:[\\/]/.test(pathFs) && process.platform === "win32")) &&
    existsSync(pathFs)
  ) {
    return readFileSync(pathFs);
  }

  throw new Error(
    "Unsupported bundle artifactUri for local Docker provisioning (need data:, http(s):// URL, or an absolute filesystem path).",
  );
}

function readBundleSource(
  desiredState: Record<string, unknown>,
): { artifactUri: string } | null {
  const source = desiredState.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return null;
  }
  const rec = source as Record<string, unknown>;
  if (rec.type !== "bundle") {
    return null;
  }
  const uri = rec.artifactUri;
  if (typeof uri !== "string" || uri.length === 0) {
    return null;
  }
  return { artifactUri: uri };
}

export async function runLocalBundledFunction(
  workloadId: string,
  desiredState: Record<string, unknown>,
): Promise<LocalDockerRunResult> {
  const bundle = readBundleSource(desiredState);
  if (!bundle) {
    throw new Error("Internal: runLocalBundledFunction requires bundle source");
  }

  const staging = stagingDirForWorkload(workloadId);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const artifactPath = join(staging, "bundle.incoming");
  const bytes = await artifactBytes(bundle.artifactUri);
  writeFileSync(artifactPath, bytes);

  extractArchive(artifactPath, staging);

  hoistIfSingleNestedRoot(staging);
  rmSync(artifactPath, { force: true });

  const runtimeRaw = desiredState.runtime === "node" ? "node" : "bun";

  const runtime = runtimeRaw === "node" ? "node" : "bun";

  mkdirSync(join(staging, ".openbika"), { recursive: true });
  copyLauncher(runtime, join(staging, ".openbika"));

  const existingPorts = readWorkloadPublishedPorts(desiredState.ports);
  const listenPort = existingPorts.length > 0 ? existingPorts[0]! : 9100;

  const env = readEnvRecord(desiredState);
  const entrypointRaw = desiredState.entrypoint;
  const entrypoint =
    typeof entrypointRaw === "string" && entrypointRaw.length > 0
      ? entrypointRaw
      : "index.ts";

  const image =
    extractDockerImageFromDesiredState(desiredState) ??
    (runtime === "bun" ? "oven/bun:1-alpine" : "node:22-alpine");

  const runDesired: Record<string, unknown> = {
    ...desiredState,
    image,
    ports: existingPorts.length > 0 ? existingPorts : [listenPort],
    env: {
      ...env,
      PORT: String(listenPort),
      OPENBIKA_CONTAINER_PORT: String(listenPort),
      OPENBIKA_ENTRYPOINT: entrypoint,
    },
  };

  const volumeBinds: DockerVolumeBind[] = [
    { hostPath: staging, containerPath: "/srv" },
  ];

  const command =
    runtime === "bun"
      ? (["bun", "run", "./.openbika/function-launcher.bun.ts"] as string[])
      : (["node", "./.openbika/function-launcher.node.mjs"] as string[]);

  return runLocalDockerContainer(workloadId, runDesired, {
    command,
    volumeBinds,
    workloadKind: "function",
    workingDir: "/srv",
  });
}

export function workloadHasBundledLocalSource(
  desiredState: Record<string, unknown>,
): boolean {
  return readBundleSource(desiredState) !== null;
}

export function workloadHasGitOnlySource(
  desiredState: Record<string, unknown>,
): boolean {
  const source = desiredState.source;
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return false;
  }
  const rec = source as Record<string, unknown>;
  return rec.type === "git" || rec.type === "gitProvider";
}

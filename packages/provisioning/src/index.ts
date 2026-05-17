import type {
  CloneBranchInput,
  CreateBackupInput,
  ProvisionClusterInput,
  ProvisionWorkloadInput,
  RestoreBackupInput,
  RotateCredentialsInput,
  WorkloadIngressAppliedRoute,
} from "@openbika/contracts";

import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { spawn } from "node:child_process";
import { PassThrough, Readable } from "node:stream";

import {
  defaultLocalFunctionImageForRuntime,
  extractDockerImageFromDesiredState,
  readWorkloadPublishedPorts,
  runLocalDockerContainer,
} from "./docker-runtime.js";
import {
  runLocalBundledFunction,
  workloadHasBundledLocalSource,
  workloadHasGitOnlySource,
} from "./local-function-bundle.js";

export interface ProvisionedEndpoint {
  hostname: string;
  port: number;
  poolerMode: "transaction" | "session";
}

export interface ProvisionedCluster {
  clusterId: string;
  endpoint: ProvisionedEndpoint;
  providerResourceId: string;
}

export interface ProvisionedWorkload {
  /** Set when the local provider runs a Docker container for this workload. */
  dockerContainerId?: string;
  /** Docker `--name` for `docker run`; safe for `docker logs`. */
  dockerContainerName?: string;
  providerResourceId: string;
  /** Invokable base URL when the control plane exposes one (placeholders in local dev). */
  publicBaseUrl?: string;
  /** Traefik-routed URLs last applied (`Host`/`Path`/container port/`https`). */
  ingressRoutes?: WorkloadIngressAppliedRoute[];
  workloadId: string;
}

export {
  buildWorkloadTraefikDockerLabels,
  punyHostname,
  workloadHttpsPublicBaseUrl,
  workloadIdToTraefikDnsLabel,
  workloadPublicHostname,
} from "./workload-hostname.js";

export {
  DEFAULT_LOCAL_FUNCTION_IMAGE_BUN,
  DEFAULT_LOCAL_FUNCTION_IMAGE_NODE,
  defaultLocalFunctionImageForRuntime,
  dockerContainerNameForWorkload,
  extractDockerImageFromDesiredState,
  readDockerContainerLogs,
} from "./docker-runtime.js";

export interface BackupArtifact {
  backupJobId: string;
  artifactUri: string;
}

/**
 * Subset of an S3 destination row used by data-plane backups. Provider
 * implementations should treat `secretAccessKey` as a credential and avoid
 * logging it.
 */
export interface BackupS3Destination {
  accessKey: string;
  additionalFlags: string[];
  bucket: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
}

/**
 * How to locate the running Postgres Docker container. Following Dokploy, we
 * run `pg_dump` *inside* that container so the binary version always matches
 * the server (no "aborting because of server version mismatch" errors).
 */
export type PostgresContainerLookup =
  | { kind: "name"; value: string }
  | { kind: "label"; key: string; value: string };

export interface PostgresExecTarget {
  containerLookup: PostgresContainerLookup;
  database: string;
  password: string;
  username: string;
}

export interface CreateBackupContext {
  branchDatabaseName: string | null;
  branchId: string | null;
  destination: BackupS3Destination | null;
  pathPrefix: string | null;
  /**
   * When set, the provider runs `pg_dump` inside this Postgres container.
   * Required for actual backups; when null and a destination is configured,
   * the provider throws so failures are visible to the operator.
   */
  postgresExec: PostgresExecTarget | null;
}

/** Normalize a user-supplied prefix: strip leading/trailing slashes and reject empty. */
export function normalizeBackupPathPrefix(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.replace(/^\/+|\/+$/g, "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Stable, hierarchical key used when uploading a backup artifact to S3.
 * Falls back to `openbika/{clusterId}/{branchId}/` when no prefix is set.
 */
export function backupS3ObjectKey(input: {
  backupJobId: string;
  branchId: string | null;
  clusterId: string;
  pathPrefix?: string | null;
}): string {
  const prefix = normalizeBackupPathPrefix(input.pathPrefix ?? null);
  const branchSegment = input.branchId ?? "default";
  const base = prefix ?? `openbika/${input.clusterId}/${branchSegment}`;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${base}/${timestamp}-${input.backupJobId}.dump`;
}

export interface RestoreResult {
  restoreJobId: string;
  branchId: string;
}

/**
 * Where the backup artifact lives. Parsed from the stored `artifact_uri`
 * (e.g. `s3://my-bucket/path/to/key?endpoint=https%3A%2F%2F...`).
 */
export interface BackupS3Source {
  bucket: string;
  key: string;
}

export interface RestoreBackupContext {
  destination: BackupS3Destination | null;
  postgresExec: PostgresExecTarget | null;
  source: BackupS3Source | null;
}

/** Parse our `s3://bucket/key?endpoint=...` artifact URI back into parts. */
export function parseBackupArtifactUri(
  artifactUri: string,
): BackupS3Source | null {
  if (!artifactUri.startsWith("s3://")) return null;
  const without = artifactUri.slice("s3://".length);
  const [hostPath] = without.split("?", 2);
  if (!hostPath) return null;
  const slash = hostPath.indexOf("/");
  if (slash < 0) return null;
  const bucket = hostPath.slice(0, slash);
  const key = hostPath.slice(slash + 1);
  if (!bucket || !key) return null;
  return { bucket, key };
}

export interface CloneBranchResult {
  branchId: string;
  copyMode: CloneBranchInput["copyMode"];
  sourceBranchId: string;
}

export interface RotatedCredentials {
  clusterId: string;
  roleName: string;
  secretRef: string;
}

export interface DataPlaneProvider {
  readonly name: string;
  provisionCluster(input: ProvisionClusterInput): Promise<ProvisionedCluster>;
  provisionWorkload(input: ProvisionWorkloadInput): Promise<ProvisionedWorkload>;
  cloneBranch(input: CloneBranchInput): Promise<CloneBranchResult>;
  createBackup(
    input: CreateBackupInput,
    context: CreateBackupContext,
  ): Promise<BackupArtifact>;
  restoreBackup(
    input: RestoreBackupInput,
    context: RestoreBackupContext,
  ): Promise<RestoreResult>;
  rotateCredentials(input: RotateCredentialsInput): Promise<RotatedCredentials>;
}

export class LocalDataPlaneProvider implements DataPlaneProvider {
  readonly name = "local";

  async provisionCluster(
    input: ProvisionClusterInput,
  ): Promise<ProvisionedCluster> {
    return {
      clusterId: input.clusterId,
      endpoint: {
        hostname: "localhost",
        port: 5432,
        poolerMode: "transaction",
      },
      providerResourceId: `local-${input.clusterId}`,
    };
  }

  async provisionWorkload(
    input: ProvisionWorkloadInput,
  ): Promise<ProvisionedWorkload> {
    if (input.kind === "container") {
      const desired =
        input.desiredState !== null &&
        typeof input.desiredState === "object" &&
        !Array.isArray(input.desiredState)
          ? (input.desiredState as Record<string, unknown>)
          : {};

      const result = await runLocalDockerContainer(input.workloadId, desired, {
        workloadKind: "container",
      });

      return {
        dockerContainerId: result.containerId,
        dockerContainerName: result.containerName,
        providerResourceId: result.providerResourceId,
        ...(result.ingressRoutes ? { ingressRoutes: result.ingressRoutes } : {}),
        publicBaseUrl: result.publicBaseUrl,
        workloadId: input.workloadId,
      };
    }

    if (input.kind === "function") {
      const desired =
        input.desiredState !== null &&
        typeof input.desiredState === "object" &&
        !Array.isArray(input.desiredState)
          ? (input.desiredState as Record<string, unknown>)
          : {};

      if (workloadHasBundledLocalSource(desired)) {
        const result = await runLocalBundledFunction(input.workloadId, desired);

        return {
          dockerContainerId: result.containerId,
          dockerContainerName: result.containerName,
          providerResourceId: result.providerResourceId,
          ...(result.ingressRoutes ? { ingressRoutes: result.ingressRoutes } : {}),
          publicBaseUrl: result.publicBaseUrl,
          workloadId: input.workloadId,
        };
      }

      const explicitImage = extractDockerImageFromDesiredState(desired);

      if (explicitImage === null) {
        if (workloadHasGitOnlySource(desired)) {
          throw new Error(
            "Local Docker provider cannot provision git-sourced functions yet. Upload a zip/tar bundle from the dashboard, or specify source.image.",
          );
        }

        throw new Error(
          "Local Docker function workloads need either a bundled artifact (`source.type: bundle`) or a container image (`source.type: image`).",
        );
      }

      const image =
        explicitImage ?? defaultLocalFunctionImageForRuntime(desired.runtime);

      const existingPorts = readWorkloadPublishedPorts(desired.ports);
      const ports = existingPorts.length > 0 ? existingPorts : [9100];
      const runDesired: Record<string, unknown> = {
        ...desired,
        image,
        ports,
      };

      /** Custom image workloads run their own entrypoint/command */
      const result = await runLocalDockerContainer(input.workloadId, runDesired, {
        workloadKind: "function",
      });

      return {
        dockerContainerId: result.containerId,
        dockerContainerName: result.containerName,
        providerResourceId: result.providerResourceId,
        ...(result.ingressRoutes ? { ingressRoutes: result.ingressRoutes } : {}),
        publicBaseUrl: result.publicBaseUrl,
        workloadId: input.workloadId,
      };
    }

    throw new Error(
      `Unsupported workload kind: ${String((input as ProvisionWorkloadInput).kind)}`,
    );
  }

  async createBackup(
    input: CreateBackupInput,
    context: CreateBackupContext,
  ): Promise<BackupArtifact> {
    if (context.destination) {
      if (!context.postgresExec) {
        throw new Error(
          "Cannot create backup: Postgres exec target is not available. Make sure the branch's database has been provisioned.",
        );
      }

      const key = backupS3ObjectKey({
        backupJobId: input.backupJobId,
        branchId: context.branchId ?? null,
        clusterId: input.clusterId,
        pathPrefix: context.pathPrefix,
      });

      await streamPgDumpToS3({
        destination: context.destination,
        key,
        target: context.postgresExec,
      });

      const endpoint = context.destination.endpoint.replace(/\/+$/, "");
      return {
        artifactUri: `s3://${context.destination.bucket}/${key}?endpoint=${encodeURIComponent(endpoint)}`,
        backupJobId: input.backupJobId,
      };
    }

    const prefix = normalizeBackupPathPrefix(context.pathPrefix);
    const branchSegment = context.branchId ?? "default";
    const base = prefix ?? `backups/${input.clusterId}/${branchSegment}`;
    return {
      artifactUri: `local://${base}/${input.backupJobId}`,
      backupJobId: input.backupJobId,
    };
  }

  async cloneBranch(input: CloneBranchInput): Promise<CloneBranchResult> {
    return {
      branchId: input.targetBranchId,
      copyMode: input.copyMode,
      sourceBranchId: input.sourceBranchId,
    };
  }

  async restoreBackup(
    input: RestoreBackupInput,
    context: RestoreBackupContext,
  ): Promise<RestoreResult> {
    if (!context.source) {
      throw new Error(
        "Cannot restore backup: source backup has no S3 artifact yet. Wait for the backup job to succeed before restoring.",
      );
    }
    if (!context.destination) {
      throw new Error(
        "Cannot restore backup: source destination is no longer configured.",
      );
    }
    if (!context.postgresExec) {
      throw new Error(
        "Cannot restore backup: target branch database is not provisioned.",
      );
    }

    await streamS3ToPgRestore({
      destination: context.destination,
      source: context.source,
      target: context.postgresExec,
    });

    return {
      restoreJobId: input.restoreJobId,
      branchId: input.targetBranchId,
    };
  }

  async rotateCredentials(
    input: RotateCredentialsInput,
  ): Promise<RotatedCredentials> {
    return {
      clusterId: input.clusterId,
      roleName: input.roleName,
      secretRef: `local://secrets/${input.clusterId}/${input.roleName}`,
    };
  }
}

/**
 * Find a running Postgres container ID for the given lookup. Returns the
 * first matching container ID; throws when nothing matches so the operator
 * sees an actionable error instead of a phantom "successful" backup.
 */
async function findPostgresContainerId(
  lookup: PostgresContainerLookup,
): Promise<string> {
  const filterArgs: string[] = ["--filter", "status=running"];
  switch (lookup.kind) {
    case "label":
      filterArgs.push("--filter", `label=${lookup.key}=${lookup.value}`);
      break;
    case "name":
      filterArgs.push("--filter", `name=${lookup.value}`);
      break;
    default: {
      const exhaustive: never = lookup;
      throw new Error(`Unknown Postgres container lookup: ${String(exhaustive)}`);
    }
  }

  const stdout = await runCapture("docker", ["ps", "-q", ...filterArgs]);
  const containerId = stdout.split("\n").find((line) => line.trim().length > 0);
  if (!containerId) {
    throw new Error(
      "Could not find a running Postgres container to dump from. Is the local Postgres compose service running?",
    );
  }
  return containerId.trim();
}

async function runCapture(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.setEncoding("utf-8");
    proc.stderr.setEncoding("utf-8");
    proc.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    proc.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed (exit ${String(code)}): ${stderr.trim()}`,
        ),
      );
    });
  });
}

/**
 * Stream `docker exec <pg> pg_dump` output straight into an S3 multipart
 * upload. Resolves once both `pg_dump` and the upload succeed; rejects (and
 * aborts the upload) if either side fails.
 *
 * Running `pg_dump` inside the running Postgres container guarantees the
 * client tool matches the server version, which avoids the
 * "aborting because of server version mismatch" failures you get from
 * mismatched host-side libpq tools.
 */
async function streamPgDumpToS3(args: {
  destination: BackupS3Destination;
  key: string;
  target: PostgresExecTarget;
}): Promise<void> {
  const { destination, key, target } = args;
  const containerId = await findPostgresContainerId(target.containerLookup);

  const s3Client = new S3Client({
    credentials: {
      accessKeyId: destination.accessKey,
      secretAccessKey: destination.secretAccessKey,
    },
    endpoint: destination.endpoint,
    forcePathStyle: true,
    region: destination.region || "auto",
  });

  const body = new PassThrough();
  const upload = new Upload({
    client: s3Client,
    params: {
      Body: body,
      Bucket: destination.bucket,
      ContentType: "application/octet-stream",
      Key: key,
    },
  });

  const dumpArgs = [
    "exec",
    "-i",
    "-e",
    `PGPASSWORD=${target.password}`,
    containerId,
    "pg_dump",
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--no-password",
    "-h",
    "localhost",
    "-U",
    target.username,
    "-d",
    target.database,
  ];

  const dumpProcess = spawn("docker", dumpArgs, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  dumpProcess.stderr.setEncoding("utf-8");
  dumpProcess.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (stderr.length > 8192) {
      stderr = stderr.slice(-8192);
    }
  });

  dumpProcess.stdout.pipe(body);

  const dumpExitPromise = new Promise<void>((resolve, reject) => {
    dumpProcess.on("error", reject);
    dumpProcess.on("close", (code, signal) => {
      if (code === 0) {
        body.end();
        resolve();
        return;
      }
      const detail = stderr.trim().split("\n").slice(-3).join("\n");
      const reason = signal
        ? `terminated by signal ${signal}`
        : `exited with code ${String(code)}`;
      const message = detail.length > 0 ? `: ${detail}` : "";
      reject(new Error(`pg_dump ${reason}${message}`));
    });
  });

  try {
    await Promise.all([dumpExitPromise, upload.done()]);
  } catch (error) {
    body.destroy(error instanceof Error ? error : new Error(String(error)));
    await upload.abort().catch(() => undefined);
    try {
      dumpProcess.kill();
    } catch {
      /* already exited */
    }
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Stream an S3 object into `docker exec <pg> pg_restore`'s stdin. Resolves
 * once both sides finish; rejects (and kills `pg_restore`) on any error.
 *
 * Running `pg_restore` inside the running Postgres container avoids client
 * version mismatch the same way `pg_dump` does in `streamPgDumpToS3`.
 */
async function streamS3ToPgRestore(args: {
  destination: BackupS3Destination;
  source: BackupS3Source;
  target: PostgresExecTarget;
}): Promise<void> {
  const { destination, source, target } = args;
  const containerId = await findPostgresContainerId(target.containerLookup);

  const s3Client = new S3Client({
    credentials: {
      accessKeyId: destination.accessKey,
      secretAccessKey: destination.secretAccessKey,
    },
    endpoint: destination.endpoint,
    forcePathStyle: true,
    region: destination.region || "auto",
  });

  const object = await s3Client.send(
    new GetObjectCommand({ Bucket: source.bucket, Key: source.key }),
  );

  const objectBody = object.Body;
  if (!objectBody || !(objectBody instanceof Readable)) {
    throw new Error(
      `Could not stream artifact body from S3 (bucket=${source.bucket} key=${source.key})`,
    );
  }
  const bodyStream: Readable = objectBody;

  const restoreArgs = [
    "exec",
    "-i",
    "-e",
    `PGPASSWORD=${target.password}`,
    containerId,
    "pg_restore",
    "--no-owner",
    "--no-acl",
    "--no-password",
    "--clean",
    "--if-exists",
    "--exit-on-error",
    "-h",
    "localhost",
    "-U",
    target.username,
    "-d",
    target.database,
  ];

  const restoreProcess = spawn("docker", restoreArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderr = "";
  restoreProcess.stderr.setEncoding("utf-8");
  restoreProcess.stderr.on("data", (chunk: string) => {
    stderr += chunk;
    if (stderr.length > 8192) {
      stderr = stderr.slice(-8192);
    }
  });

  bodyStream.pipe(restoreProcess.stdin);

  const streamErrorPromise = new Promise<never>((_, reject) => {
    bodyStream.on("error", (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  const restoreExitPromise = new Promise<void>((resolve, reject) => {
    restoreProcess.on("error", reject);
    restoreProcess.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = stderr.trim().split("\n").slice(-5).join("\n");
      const reason = signal
        ? `terminated by signal ${signal}`
        : `exited with code ${String(code)}`;
      const message = detail.length > 0 ? `: ${detail}` : "";
      reject(new Error(`pg_restore ${reason}${message}`));
    });
  });

  try {
    await Promise.race([restoreExitPromise, streamErrorPromise]);
  } catch (error) {
    try {
      restoreProcess.kill();
    } catch {
      /* already exited */
    }
    bodyStream.destroy();
    throw error instanceof Error ? error : new Error(String(error));
  }
}

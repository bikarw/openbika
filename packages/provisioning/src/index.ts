import type {
  CloneBranchInput,
  CreateBackupInput,
  ProvisionClusterInput,
  ProvisionWorkloadInput,
  RestoreBackupInput,
  RotateCredentialsInput,
  WorkloadIngressAppliedRoute,
} from "@openbika/contracts";

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

export interface RestoreResult {
  restoreJobId: string;
  branchId: string;
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
  createBackup(input: CreateBackupInput): Promise<BackupArtifact>;
  restoreBackup(input: RestoreBackupInput): Promise<RestoreResult>;
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

  async createBackup(input: CreateBackupInput): Promise<BackupArtifact> {
    return {
      backupJobId: input.backupJobId,
      artifactUri: `local://backups/${input.clusterId}/${input.backupJobId}`,
    };
  }

  async cloneBranch(input: CloneBranchInput): Promise<CloneBranchResult> {
    return {
      branchId: input.targetBranchId,
      copyMode: input.copyMode,
      sourceBranchId: input.sourceBranchId,
    };
  }

  async restoreBackup(input: RestoreBackupInput): Promise<RestoreResult> {
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

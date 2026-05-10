import type {
  CloneBranchInput,
  CreateBackupInput,
  ProvisionClusterInput,
  RestoreBackupInput,
  RotateCredentialsInput,
} from "@openbika/contracts";

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

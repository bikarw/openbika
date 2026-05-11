import { proxyActivities } from "@temporalio/workflow";
import type {
  CloneBranchInput,
  CreateBackupInput,
  ProvisionClusterInput,
  ProvisionWorkloadInput,
  RestoreBackupInput,
  RotateCredentialsInput,
} from "@openbika/contracts";
import type {
  BackupArtifact,
  CloneBranchResult,
  ProvisionedCluster,
  ProvisionedWorkload,
  RestoreResult,
  RotatedCredentials,
} from "@openbika/provisioning";

import type * as activities from "./activities.js";

const {
  cloneBranchActivity,
  createBackupActivity,
  provisionClusterActivity,
  provisionWorkloadActivity,
  restoreBackupActivity,
  rotateCredentialsActivity,
} = proxyActivities<typeof activities>({
  retry: {
    initialInterval: "5 seconds",
    maximumAttempts: 5,
  },
  startToCloseTimeout: "10 minutes",
});

export async function provisionCluster(
  input: ProvisionClusterInput,
): Promise<ProvisionedCluster> {
  return provisionClusterActivity(input);
}

export async function provisionWorkload(
  input: ProvisionWorkloadInput,
): Promise<ProvisionedWorkload> {
  return provisionWorkloadActivity(input);
}

export async function cloneBranch(
  input: CloneBranchInput,
): Promise<CloneBranchResult> {
  return cloneBranchActivity(input);
}

export async function createBackup(
  input: CreateBackupInput,
): Promise<BackupArtifact> {
  return createBackupActivity(input);
}

export async function restoreBackup(
  input: RestoreBackupInput,
): Promise<RestoreResult> {
  return restoreBackupActivity(input);
}

export async function rotateCredentials(
  input: RotateCredentialsInput,
): Promise<RotatedCredentials> {
  return rotateCredentialsActivity(input);
}

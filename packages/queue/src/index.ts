import type {
  CloneBranchInput,
  CreateBackupInput,
  ProvisionClusterInput,
  RestoreBackupInput,
  RotateCredentialsInput,
} from "@openbika/contracts";

export const temporalTaskQueue = "openbika-control-plane";

export const workflowNames = {
  provisionCluster: "provisionCluster",
  cloneBranch: "cloneBranch",
  createBackup: "createBackup",
  restoreBackup: "restoreBackup",
  rotateCredentials: "rotateCredentials",
} as const;

export type WorkflowName = (typeof workflowNames)[keyof typeof workflowNames];

export interface WorkflowPayloads {
  [workflowNames.provisionCluster]: ProvisionClusterInput;
  [workflowNames.cloneBranch]: CloneBranchInput;
  [workflowNames.createBackup]: CreateBackupInput;
  [workflowNames.restoreBackup]: RestoreBackupInput;
  [workflowNames.rotateCredentials]: RotateCredentialsInput;
}

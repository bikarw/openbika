import { ulid } from "ulid";

import type {
  BranchCopyMode,
  BranchStatus,
  ClusterStatus,
  PlanKind,
  ProviderKind,
} from "@openbika/contracts";

export type EntityPrefix =
  | "org"
  | "mem"
  | "prj"
  | "db"
  | "br"
  | "ep"
  | "bkp"
  | "rst";

const prefixMap = {
  backup_job: "bkp",
  branch: "br",
  database_cluster: "db",
  endpoint: "ep",
  membership: "mem",
  organization: "org",
  project: "prj",
  restore_job: "rst",
} as const satisfies Record<string, EntityPrefix>;

export type EntityKind = keyof typeof prefixMap;

export function createId(entity: EntityKind): string {
  return `${prefixMap[entity]}_${ulid()}`;
}

export function generateULID(): string {
  return ulid();
}

const branchIdPattern = /^br_[0-9A-HJKMNP-TV-Z]{26}$/;

export function isBranchId(value: string): boolean {
  return branchIdPattern.test(value);
}

export interface OrganizationRef {
  id: string;
  slug: string;
  name: string;
}

export interface ProjectRef {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
}

export interface RegionRef {
  id: string;
  provider: ProviderKind;
  code: string;
  name: string;
  countryCode: string;
}

export interface DatabaseClusterRef {
  id: string;
  projectId: string;
  regionId: string;
  name: string;
  plan: PlanKind;
  status: ClusterStatus;
  postgresVersion: string;
}

export interface BranchRef {
  id: string;
  clusterId: string;
  parentBranchId: string | null;
  copyMode: BranchCopyMode;
  expiresAt: Date | null;
  name: string;
  status: BranchStatus;
}

export function isTerminalClusterStatus(status: ClusterStatus): boolean {
  switch (status) {
    case "available":
    case "degraded":
    case "failed":
    case "deleted":
      return true;
    case "requested":
    case "provisioning":
    case "maintenance":
      return false;
    default: {
      const exhaustive: never = status;
      return exhaustive;
    }
  }
}

import type { QueryClient } from "@tanstack/react-query";

import { resolveDatabaseIdForBranchCached } from "#/lib/dashboard-api-queries";

export async function resolveDatabaseIdForBranch(
  queryClient: QueryClient,
  organizationSlug: string,
  projectSlug: string,
  branchId: string,
): Promise<string | null> {
  return resolveDatabaseIdForBranchCached(
    queryClient,
    organizationSlug,
    projectSlug,
    branchId,
  );
}

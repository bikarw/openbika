import { createFileRoute, redirect } from "@tanstack/react-router";

import { resolveDatabaseIdForBranch } from "#/lib/branch-database-route";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/branches/$branchId/$view",
)({
  beforeLoad: async ({ context, params }) => {
    const lowered =
      typeof params.view === "string" ? params.view.toLowerCase() : "overview";
    const view: "backups" | "overview" | "settings" | "sql" | "tables" =
      lowered === "backups" ||
      lowered === "overview" ||
      lowered === "settings" ||
      lowered === "sql" ||
      lowered === "tables"
        ? lowered
        : "overview";

    const databaseId = await resolveDatabaseIdForBranch(
      context.queryClient,
      params.organizationSlug,
      params.projectSlug,
      params.branchId,
    );

    if (!databaseId) {
      throw redirect({
        params: {
          organizationSlug: params.organizationSlug,
          projectSlug: params.projectSlug,
        },
        search: {},
        to: "/$organizationSlug/projects/$projectSlug/databases",
      });
    }

    throw redirect({
      params: {
        branchId: params.branchId,
        databaseId,
        organizationSlug: params.organizationSlug,
        projectSlug: params.projectSlug,
        view,
      },
      search: {},
      to: "/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/$branchId/$view",
    });
  },
  component: () => null,
});

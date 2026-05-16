import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/branches/",
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: {
        databaseId: params.databaseId,
        organizationSlug: params.organizationSlug,
        projectSlug: params.projectSlug,
      },
      search: {},
      to: "/$organizationSlug/projects/$projectSlug/databases/$databaseId",
    });
  },
  component: () => null,
});

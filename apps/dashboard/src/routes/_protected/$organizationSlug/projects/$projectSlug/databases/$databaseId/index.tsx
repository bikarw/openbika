import { createFileRoute } from "@tanstack/react-router";

import { DatabaseResourceOverviewOutlet } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/",
)({
  component: DatabaseOverviewTabRoute,
});

function DatabaseOverviewTabRoute() {
  const { databaseId } = Route.useParams();

  return <DatabaseResourceOverviewOutlet databaseId={databaseId} />;
}

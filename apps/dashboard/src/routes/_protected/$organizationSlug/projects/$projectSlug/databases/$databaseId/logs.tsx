import { createFileRoute } from "@tanstack/react-router";

import { DatabaseResourcePlaceholderOutlet } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/logs",
)({
  component: DatabaseLogsTabRoute,
});

function DatabaseLogsTabRoute() {
  return (
    <DatabaseResourcePlaceholderOutlet
      description="Query logs and engine output for this Postgres cluster once log streaming ships."
      title="Logs"
    />
  );
}

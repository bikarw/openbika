import { createFileRoute } from "@tanstack/react-router";

import { DatabaseResourcePlaceholderOutlet } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/env",
)({
  component: DatabaseEnvTabRoute,
});

function DatabaseEnvTabRoute() {
  return (
    <DatabaseResourcePlaceholderOutlet
      description="Per-database environment configuration and injected secrets will show here once wired to provisioning."
      title="Environment"
    />
  );
}

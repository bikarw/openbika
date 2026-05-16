import type { ControlPlaneActivityLogEntry } from "@openbika/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ControlPlaneLogPanel } from "#/components/control-plane-log-panel";
import { readControlPlaneActivityLog } from "#/lib/control-plane-log";
import {
  dashboardKeys,
  fetchDatabase,
} from "#/lib/dashboard-api-queries";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/logs",
)({
  component: DatabaseLogsTabRoute,
});

function DatabaseLogsTabRoute() {
  const { databaseId } = Route.useParams();

  const dbLogsQuery = useQuery({
    queryKey: [...dashboardKeys.root, "database-logs-tab", databaseId],
    queryFn: async () => {
      const database = await fetchDatabase(databaseId);
      return readControlPlaneActivityLog(database.observedState);
    },
    refetchInterval: 1_500,
  });

  const entries: ControlPlaneActivityLogEntry[] = dbLogsQuery.data ?? [];
  const errorMessage =
    dbLogsQuery.error instanceof Error
      ? dbLogsQuery.error.message
      : dbLogsQuery.isError
        ? "Failed to load logs"
        : null;

  return (
    <div className="grid gap-3">
      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <ControlPlaneLogPanel
        description="Control-plane provisioning events for this Postgres cluster."
        entries={entries}
        pending={dbLogsQuery.isPending}
        title="Logs"
      />
    </div>
  );
}

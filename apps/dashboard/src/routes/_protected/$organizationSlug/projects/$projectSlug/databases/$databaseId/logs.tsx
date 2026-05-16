import type { ControlPlaneActivityLogEntry } from "@openbika/contracts";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";

import { ControlPlaneLogPanel } from "#/components/control-plane-log-panel";
import { readControlPlaneActivityLog } from "#/lib/control-plane-log";
import { getDashboardApiClient } from "#/lib/openbika-client";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId/logs",
)({
  component: DatabaseLogsTabRoute,
});

function DatabaseLogsTabRoute() {
  const { databaseId } = Route.useParams();
  const [entries, setEntries] = React.useState<ControlPlaneActivityLogEntry[]>(
    [],
  );
  const [pending, setPending] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const client = getDashboardApiClient();

    async function tick() {
      try {
        const database = await client.getDatabase(databaseId);
        if (cancelled) return;
        setEntries(readControlPlaneActivityLog(database.observedState));
        setErrorMessage(null);
      } catch (err) {
        if (cancelled) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to load logs",
        );
      } finally {
        if (!cancelled) setPending(false);
      }
    }

    void tick();
    const intervalId = window.setInterval(() => void tick(), 1_500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [databaseId]);

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
        pending={pending}
        title="Logs"
      />
    </div>
  );
}

import type { ControlPlaneActivityLogEntry } from "@openbika/contracts";
import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";

import { ControlPlaneLogPanel } from "#/components/control-plane-log-panel";
import { WorkloadRuntimeLogPanel } from "#/components/workload-runtime-log-panel";
import { readControlPlaneActivityLog } from "#/lib/control-plane-log";
import { getDashboardApiClient } from "#/lib/openbika-client";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId/logs",
)({
  component: WorkloadLogsTabRoute,
});

function WorkloadLogsTabRoute() {
  const { workloadId } = Route.useParams();
  const [entries, setEntries] = React.useState<ControlPlaneActivityLogEntry[]>(
    [],
  );
  const [pending, setPending] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const [workloadKind, setWorkloadKind] = React.useState<
    "container" | "function" | null
  >(null);
  const [runtimeText, setRuntimeText] = React.useState("");
  const [runtimePending, setRuntimePending] = React.useState(true);
  const [runtimeError, setRuntimeError] = React.useState<string | null>(null);

  const showRuntimePanel =
    workloadKind === "container" || workloadKind === "function";

  React.useEffect(() => {
    let cancelled = false;
    const client = getDashboardApiClient();

    async function tick() {
      try {
        const workload = await client.getWorkload(workloadId);
        if (cancelled) return;
        setEntries(readControlPlaneActivityLog(workload.observedState));
        setWorkloadKind(workload.kind);
        setErrorMessage(null);

        if (workload.kind === "container" || workload.kind === "function") {
          try {
            const logs = await client.getWorkloadRuntimeLogs(workloadId, {
              tail: 750,
            });
            if (cancelled) return;
            setRuntimeText(logs.logs);
            setRuntimeError(null);
          } catch (err) {
            if (cancelled) return;
            setRuntimeError(
              err instanceof Error ? err.message : "Failed to load runtime logs",
            );
          } finally {
            if (!cancelled) setRuntimePending(false);
          }
        } else {
          setRuntimePending(false);
        }
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
    const intervalId = window.setInterval(() => void tick(), 2_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [workloadId]);

  const runtimeDescription =
    workloadKind === "function"
      ? "Docker stdout/stderr for the function container. Bun vs Node picks a default image when you do not set source.image; runtime logs use the same machinery as containers."
      : "Docker stdout/stderr from the workload container (`docker logs`).";

  return (
    <div className="grid gap-3">
      {errorMessage ? (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <ControlPlaneLogPanel
        description="Provisioning and control-plane steps from the Temporal worker. This is separate from your app’s process output in Runtime below."
        entries={entries}
        pending={pending}
        title="Provisioning"
      />
      <WorkloadRuntimeLogPanel
        description={runtimeDescription}
        errorMessage={runtimeError}
        pending={runtimePending && showRuntimePanel}
        text={runtimeText}
        title="Runtime (process)"
        visible={showRuntimePanel}
      />
    </div>
  );
}

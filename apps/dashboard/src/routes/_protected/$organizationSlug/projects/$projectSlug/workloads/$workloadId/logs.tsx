import type { ControlPlaneActivityLogEntry } from "@openbika/contracts";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { ControlPlaneLogPanel } from "#/components/control-plane-log-panel";
import { WorkloadRuntimeLogPanel } from "#/components/workload-runtime-log-panel";
import { readControlPlaneActivityLog } from "#/lib/control-plane-log";
import {
  dashboardKeys,
  fetchWorkload,
  fetchWorkloadRuntimeLogs,
} from "#/lib/dashboard-api-queries";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId/logs",
)({
  component: WorkloadLogsTabRoute,
});

function WorkloadLogsTabRoute() {
  const { workloadId } = Route.useParams();

  const tickQuery = useQuery({
    queryKey: [...dashboardKeys.root, "workload-logs-tab", workloadId],
    queryFn: async () => {
      const workload = await fetchWorkload(workloadId);
      const entries = readControlPlaneActivityLog(workload.observedState);
      let runtimeText = "";
      let runtimeError: string | null = null;
      if (workload.kind === "container" || workload.kind === "function") {
        try {
          const logs = await fetchWorkloadRuntimeLogs(workloadId, 750);
          runtimeText = logs.logs;
        } catch (err) {
          runtimeError =
            err instanceof Error ? err.message : "Failed to load runtime logs";
        }
      }
      return {
        entries,
        runtimeError,
        runtimeText,
        workloadKind: workload.kind,
      };
    },
    refetchInterval: 2_000,
  });

  const data = tickQuery.data;
  const errorMessage =
    tickQuery.error instanceof Error
      ? tickQuery.error.message
      : tickQuery.isError
        ? "Failed to load logs"
        : null;

  const entries: ControlPlaneActivityLogEntry[] = data?.entries ?? [];
  const workloadKind = data?.workloadKind ?? null;
  const showRuntimePanel =
    workloadKind === "container" || workloadKind === "function";

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
        pending={tickQuery.isPending}
        title="Provisioning"
      />
      <WorkloadRuntimeLogPanel
        description={runtimeDescription}
        errorMessage={data?.runtimeError ?? null}
        pending={tickQuery.isPending && showRuntimePanel}
        text={data?.runtimeText ?? ""}
        title="Runtime (process)"
        visible={showRuntimePanel}
      />
    </div>
  );
}

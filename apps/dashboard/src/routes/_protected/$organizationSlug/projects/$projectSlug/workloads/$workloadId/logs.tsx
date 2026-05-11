import { createFileRoute } from "@tanstack/react-router";

import { WorkloadResourcePlaceholderOutlet } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId/logs",
)({
  component: WorkloadLogsTabRoute,
});

function WorkloadLogsTabRoute() {
  return (
    <WorkloadResourcePlaceholderOutlet
      description="Container and function stdout / stderr tails will arrive here when shipping log plumbing."
      title="Logs"
    />
  );
}

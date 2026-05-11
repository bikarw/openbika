import { createFileRoute } from "@tanstack/react-router";

import { WorkloadResourcePlaceholderOutlet } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId/env",
)({
  component: WorkloadEnvTabRoute,
});

function WorkloadEnvTabRoute() {
  return (
    <WorkloadResourcePlaceholderOutlet
      description="Declared environment variables vs what the workload currently observes will compare here."
      title="Environment"
    />
  );
}

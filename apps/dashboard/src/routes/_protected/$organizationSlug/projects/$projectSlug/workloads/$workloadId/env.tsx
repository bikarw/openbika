import { createFileRoute } from "@tanstack/react-router";

import { WorkloadEnvironmentPanel } from "#/components/workload-env-panel";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId/env",
)({
  component: WorkloadEnvTabRoute,
});

function WorkloadEnvTabRoute() {
  const { workloadId } = Route.useParams();

  return <WorkloadEnvironmentPanel workloadId={workloadId} />;
}

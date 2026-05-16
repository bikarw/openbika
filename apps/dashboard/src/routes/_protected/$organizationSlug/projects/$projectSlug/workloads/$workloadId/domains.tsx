import { createFileRoute } from "@tanstack/react-router";

import { WorkloadDomainsPanel } from "#/components/workload-domains-panel";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId/domains",
)({
  component: WorkloadDomainsTabRoute,
});

function WorkloadDomainsTabRoute() {
  const { workloadId } = Route.useParams();

  return <WorkloadDomainsPanel workloadId={workloadId} />;
}

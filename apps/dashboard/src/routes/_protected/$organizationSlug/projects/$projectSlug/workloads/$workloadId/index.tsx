import { createFileRoute } from "@tanstack/react-router";

import { WorkloadResourceOverviewOutlet } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId/",
)({
  component: WorkloadOverviewTabRoute,
});

function WorkloadOverviewTabRoute() {
  const { workloadId } = Route.useParams();

  return <WorkloadResourceOverviewOutlet workloadId={workloadId} />;
}

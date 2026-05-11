import { Outlet, createFileRoute } from "@tanstack/react-router";

import { ProjectWorkspace } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/$workloadId",
)({
  component: WorkloadResourceLayoutRoute,
});

function WorkloadResourceLayoutRoute() {
  const { organizationSlug, projectSlug, workloadId } = Route.useParams();

  return (
    <ProjectWorkspace
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view="workload-detail"
      workloadDetailId={workloadId}
    >
      <Outlet />
    </ProjectWorkspace>
  );
}

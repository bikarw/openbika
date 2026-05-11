import { createFileRoute } from "@tanstack/react-router";

import { ProjectWorkspace } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/workloads/",
)({
  component: ProjectWorkloadsRoutePage,
});

function ProjectWorkloadsRoutePage() {
  const { organizationSlug, projectSlug } = Route.useParams();

  return (
    <ProjectWorkspace
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view="workloads"
    />
  );
}

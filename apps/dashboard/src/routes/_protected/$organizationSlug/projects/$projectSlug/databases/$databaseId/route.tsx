import { Outlet, createFileRoute } from "@tanstack/react-router";

import { ProjectWorkspace } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/$databaseId",
)({
  component: DatabaseResourceLayoutRoute,
});

function DatabaseResourceLayoutRoute() {
  const { databaseId, organizationSlug, projectSlug } = Route.useParams();

  return (
    <ProjectWorkspace
      databaseDetailId={databaseId}
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view="database-detail"
    >
      <Outlet />
    </ProjectWorkspace>
  );
}

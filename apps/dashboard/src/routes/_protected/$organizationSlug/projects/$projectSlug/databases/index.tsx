import { createFileRoute, redirect } from "@tanstack/react-router";

import { ProjectWorkspace } from "#/components/project-workspace";

export const Route = createFileRoute(
  "/_protected/$organizationSlug/projects/$projectSlug/databases/",
)({
  validateSearch: (raw: Record<string, unknown>): { databaseId?: string } => ({
    databaseId:
      typeof raw.databaseId === "string" && raw.databaseId.length > 0
        ? raw.databaseId
        : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    if (!search.databaseId) return;

    throw redirect({
      params: {
        databaseId: search.databaseId,
        organizationSlug: params.organizationSlug,
        projectSlug: params.projectSlug,
      },
      search: {},
      to: "/$organizationSlug/projects/$projectSlug/databases/$databaseId",
    });
  },
  component: ProjectDatabasesRoutePage,
});

function ProjectDatabasesRoutePage() {
  const { organizationSlug, projectSlug } = Route.useParams();

  return (
    <ProjectWorkspace
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view="databases"
    />
  );
}

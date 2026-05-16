import { createFileRoute, Outlet } from '@tanstack/react-router'

import { ProjectWorkspace } from '#/components/project-workspace'

export const Route = createFileRoute(
  '/_protected/$organizationSlug/projects/$projectSlug',
)({
  component: ProjectRoutePage,
})

function ProjectRoutePage() {
  const { organizationSlug, projectSlug } = Route.useParams()

  return (
    <ProjectWorkspace
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
    >
      <Outlet />
    </ProjectWorkspace>
  )
}

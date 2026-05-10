import { createFileRoute } from '@tanstack/react-router'

import { ProjectWorkspace } from '#/components/project-workspace'

export const Route = createFileRoute(
  '/_protected/$organizationSlug/projects/$projectSlug/branches/',
)({
  component: ProjectBranchesRoutePage,
})

function ProjectBranchesRoutePage() {
  const { organizationSlug, projectSlug } = Route.useParams()

  return (
    <ProjectWorkspace
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view="branches"
    />
  )
}

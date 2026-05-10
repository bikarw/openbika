import { createFileRoute } from '@tanstack/react-router'

import { ProjectWorkspace } from '#/components/project-workspace'

export const Route = createFileRoute(
  '/_protected/$organizationSlug/projects/$projectSlug/branches/$branchId/$view',
)({
  component: ProjectBranchRoutePage,
})

function ProjectBranchRoutePage() {
  const { branchId, organizationSlug, projectSlug, view } = Route.useParams()

  return (
    <ProjectWorkspace
      branchId={branchId}
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view={view === 'sql' || view === 'tables' ? view : 'overview'}
    />
  )
}

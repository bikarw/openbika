import { createFileRoute, useRouterState } from '@tanstack/react-router'

import { ProjectWorkspace } from '#/components/project-workspace'

export const Route = createFileRoute(
  '/_protected/$organizationSlug/projects/$projectSlug',
)({
  component: ProjectRoutePage,
})

function ProjectRoutePage() {
  const { organizationSlug, projectSlug } = Route.useParams()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  const pathParts = pathname.split('/').filter(Boolean)
  const branchesIndex = pathParts.indexOf('branches')
  const branchId =
    branchesIndex === -1 ? undefined : pathParts[branchesIndex + 1]
  const branchView = branchesIndex === -1 ? undefined : pathParts[branchesIndex + 2]
  const view =
    branchesIndex === -1
      ? 'dashboard'
      : branchId && (branchView === 'sql' || branchView === 'tables')
        ? branchView
        : branchId
          ? 'overview'
          : 'branches'

  return (
    <ProjectWorkspace
      branchId={branchId}
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view={view}
    />
  )
}

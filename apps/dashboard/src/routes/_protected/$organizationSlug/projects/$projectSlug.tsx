import { createFileRoute, Outlet, useRouterState } from '@tanstack/react-router'

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

  // Child routes (services / databases / workloads / branches) own their
  // own rendering via the Outlet below. This branch only handles the
  // exact `/projects/$projectSlug` URL with the dashboard view.
  const projectSlugMatch = `/projects/${projectSlug}`
  const projectSlugIndex = pathname.indexOf(projectSlugMatch)
  const remainder =
    projectSlugIndex === -1
      ? ''
      : pathname.slice(projectSlugIndex + projectSlugMatch.length)
  const isProjectIndex = remainder === '' || remainder === '/'

  if (!isProjectIndex) {
    return <Outlet />
  }

  return (
    <ProjectWorkspace
      organizationSlug={organizationSlug}
      projectSlug={projectSlug}
      view="dashboard"
    />
  )
}

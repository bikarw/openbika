import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import type { OrganizationResponse } from '@openbika/contracts'
import * as React from 'react'

import {
  dashboardKeys,
  fetchOrganizations,
} from '#/lib/dashboard-api-queries'
import { readStoredOrganizationId } from '#/lib/selected-organization'

export const Route = createFileRoute('/_protected/')({
  component: OrganizationRedirectPage,
})

function pickOrganization(
  organizations: OrganizationResponse[],
): OrganizationResponse | null {
  if (organizations.length === 0) return null
  const stored = readStoredOrganizationId()
  const storedOrganization = organizations.find((o) => o.id === stored)
  if (storedOrganization) {
    return storedOrganization
  }
  return organizations[0] ?? null
}

function OrganizationRedirectPage() {
  const navigate = useNavigate({ from: '/' })

  const orgsQuery = useQuery({
    queryKey: dashboardKeys.organizations(),
    queryFn: fetchOrganizations,
  })

  React.useEffect(() => {
    if (!orgsQuery.data || orgsQuery.isPending) return
    const organization = pickOrganization(orgsQuery.data)
    if (!organization) return
    void navigate({
      to: '/$organizationSlug/projects',
      params: { organizationSlug: organization.slug },
      replace: true,
    })
  }, [orgsQuery.data, orgsQuery.isPending, navigate])

  const loadError = orgsQuery.error instanceof Error
    ? orgsQuery.error.message
    : orgsQuery.data?.length === 0
      ? 'No organizations available.'
      : null

  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-muted-foreground text-sm">
      {loadError ?? (orgsQuery.isPending ? 'Opening organization…' : null)}
    </div>
  )
}

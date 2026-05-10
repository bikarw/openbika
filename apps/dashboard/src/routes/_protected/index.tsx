import {
  createFileRoute,
  useNavigate,
} from '@tanstack/react-router'
import type { OrganizationResponse } from '@openbika/contracts'
import * as React from 'react'

import { getDashboardApiClient } from '#/lib/openbika-client'
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
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const client = getDashboardApiClient()

    async function redirectToOrganization() {
      setLoadError(null)
      try {
        const orgs = await client.listOrganizations()
        if (cancelled) return
        const organization = pickOrganization(orgs)
        if (!organization) {
          setLoadError('No organizations available.')
          return
        }
        await navigate({
          to: '/$organizationSlug/projects',
          params: { organizationSlug: organization.slug },
          replace: true,
        })
      } catch (err) {
        if (cancelled) return
        setLoadError(
          err instanceof Error ? err.message : 'Failed to open organization',
        )
      }
    }

    void redirectToOrganization()
    return () => {
      cancelled = true
    }
  }, [navigate])

  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-muted-foreground text-sm">
      {loadError ?? 'Opening organization…'}
    </div>
  )
}

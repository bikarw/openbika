import type { OrganizationResponse } from '@openbika/contracts'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@openbika/ui/components/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@openbika/ui/components/sidebar'
import { cn } from '@openbika/ui/lib/utils'
import { Building2, ChevronsUpDown } from 'lucide-react'

export interface OrgSwitcherProps {
  disabled?: boolean
  onSelectOrganization: (organizationId: string) => void
  organizations: OrganizationResponse[]
  pending?: boolean
  selectedOrganizationId: string | null
}

export function OrgSwitcher({
  disabled,
  onSelectOrganization,
  organizations,
  pending,
  selectedOrganizationId,
}: OrgSwitcherProps) {
  const active =
    organizations.find((o) => o.id === selectedOrganizationId) ??
    organizations[0] ??
    null

  if (pending && organizations.length === 0) {
    return (
      <SidebarMenu className="inline-block max-w-xs min-w-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            className="w-full min-w-0"
            disabled
            size="lg"
            type="button"
          >
            <Building2
              className="size-4 shrink-0"
              data-slot="org-icon"
            />
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium text-muted-foreground">
                Loading organizations…
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (!active) {
    return (
      <SidebarMenu className="inline-block max-w-xs min-w-0">
        <SidebarMenuItem>
          <SidebarMenuButton
            className="w-full min-w-0"
            disabled
            size="lg"
            type="button"
          >
            <Building2
              className="size-4 shrink-0"
              data-slot="org-icon"
            />
            <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">No organizations</span>
              <span className="truncate text-muted-foreground text-xs">
                You&apos;re not in any organization yet.
              </span>
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu className="inline-block max-w-xs min-w-0">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <SidebarMenuButton className="w-full min-w-0" size="lg" type="button">
              <Building2
                className="size-4 shrink-0"
                data-slot="org-icon"
              />
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{active.name}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-60" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className={cn(
              'rounded-lg',
              'min-w-56 max-w-[min(100vw-2rem,var(--radix-dropdown-menu-trigger-width))]',
            )}
            side="bottom"
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              Organizations
            </DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem
                className="gap-2 p-2"
                key={org.id}
                onClick={() => onSelectOrganization(org.id)}
              >
                <Building2 className="size-4 shrink-0 opacity-70" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium">{org.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {org.slug}
                  </span>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

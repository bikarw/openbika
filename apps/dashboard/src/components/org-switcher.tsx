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
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton disabled size="lg" type="button">
            <div
              className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
              data-slot="org-icon"
            >
              <Building2 className="size-4" />
            </div>
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
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton disabled size="lg" type="button">
            <div
              className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
              data-slot="org-icon"
            >
              <Building2 className="size-4" />
            </div>
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
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <SidebarMenuButton size="lg" type="button">
              <div
                className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
                data-slot="org-icon"
              >
                <Building2 className="size-4" />
              </div>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{active.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {active.slug}
                </span>
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
                <div className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-background">
                  <Building2 className="size-3.5 shrink-0 opacity-70" />
                </div>
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

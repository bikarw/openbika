import type * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Boxes, LogOut, Settings } from 'lucide-react'

import { Badge } from '@openbika/ui/components/badge'
import { Button } from '@openbika/ui/components/button'

import type { AuthUser } from '#/auth-session'
import { HeaderUserMenu } from '#/components/header-user-menu'
import { HeaderStatusBadgeSkeleton } from '#/components/loading-placeholders'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@openbika/ui/components/sidebar'

export interface DashboardShellProps {
  activeNav?: 'projects' | 'settings'
  children: React.ReactNode
  headerStatus?: 'error' | 'loading' | 'ok' | null
  onSignOut: () => void
  organizationSlug?: string
  orgSwitcher: React.ReactNode
  user: AuthUser | null
}

export function DashboardShell({
  activeNav = 'projects',
  children,
  headerStatus,
  onSignOut,
  organizationSlug,
  orgSwitcher,
  user,
}: DashboardShellProps) {
  const navigate = useNavigate()

  function navigateTo(path: 'projects' | 'settings') {
    if (!organizationSlug) return
    void navigate({
      to:
        path === 'projects'
          ? '/$organizationSlug/projects'
          : '/$organizationSlug/settings',
      params: { organizationSlug },
    })
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-16 min-w-0 items-center justify-between gap-4 border-border border-b px-3">
        <div className="flex min-w-0 items-center">{orgSwitcher}</div>

        <div className="flex shrink-0 items-center justify-end gap-2">
          <div className="hidden items-center gap-2 md:flex">
            {headerStatus === 'loading' ? <HeaderStatusBadgeSkeleton /> : null}
            {headerStatus === 'ok' ? (
              <Badge className="gap-1.5" variant="outline">
                <span className="size-1.5 rounded-full bg-primary" />
                All OK
              </Badge>
            ) : null}
            {headerStatus === 'error' ? (
              <Badge className="gap-1.5" variant="outline">
                <span className="size-1.5 rounded-full bg-destructive" />
                Can&apos;t reach service
              </Badge>
            ) : null}
          </div>
          <HeaderUserMenu onSignOut={onSignOut} user={user} />
        </div>
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] md:grid-cols-[240px_1fr]">
        <Sidebar className="min-h-0">
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeNav === 'projects'}
                    onClick={() => navigateTo('projects')}
                  >
                    <Boxes className="size-4" />
                    Projects
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeNav === 'settings'}
                    onClick={() => navigateTo('settings')}
                  >
                    <Settings className="size-4" />
                    Settings
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter>
            <Button
              className="w-full justify-start"
              onClick={() => void onSignOut()}
              type="button"
              variant="ghost"
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </SidebarFooter>
        </Sidebar>

        <SidebarInset>{children}</SidebarInset>
      </div>
    </div>
  )
}

import type * as React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Boxes, GitBranch, HardDrive, LogOut, Settings } from 'lucide-react'

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
  activeNav?: 'destinations' | 'git' | 'projects' | 'settings'
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

  function navigateTo(path: 'destinations' | 'git' | 'projects' | 'settings') {
    if (!organizationSlug) return
    const target =
      path === 'projects'
        ? '/$organizationSlug/projects'
        : path === 'settings'
          ? '/$organizationSlug/settings'
          : path === 'git'
            ? '/$organizationSlug/git'
            : '/$organizationSlug/destinations'
    void navigate({
      params: { organizationSlug },
      to: target,
    })
  }

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-16 min-w-0 shrink-0 items-center justify-between gap-4 border-border border-b px-3">
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

      <div className="grid min-h-0 flex-1 md:grid-cols-[240px_1fr]">
        <Sidebar className="h-full min-h-0 overflow-hidden">
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
                    isActive={activeNav === 'destinations'}
                    onClick={() => navigateTo('destinations')}
                  >
                    <HardDrive className="size-4" />
                    Destinations
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeNav === 'git'}
                    onClick={() => navigateTo('git')}
                  >
                    <GitBranch className="size-4" />
                    Git
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

        <SidebarInset className="min-h-0 min-w-0 overflow-y-auto">
          {children}
        </SidebarInset>
      </div>
    </div>
  )
}

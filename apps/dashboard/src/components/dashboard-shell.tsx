import type * as React from 'react'
import { Boxes, LogOut } from 'lucide-react'

import { Badge } from '@openbika/ui/components/badge'
import { Button } from '@openbika/ui/components/button'

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
  children: React.ReactNode
  headerStatus?: 'error' | 'loading' | 'ok' | null
  onSignOut: () => void
  orgSwitcher: React.ReactNode
}

export function DashboardShell({
  children,
  headerStatus,
  onSignOut,
  orgSwitcher,
}: DashboardShellProps) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="flex h-16 min-w-0 items-center justify-between gap-4 border-border border-b px-3">
        <div className="flex min-w-0 items-center">{orgSwitcher}</div>

        <div className="hidden shrink-0 items-center justify-end gap-2 md:flex">
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
      </header>

      <div className="grid min-h-[calc(100dvh-4rem)] md:grid-cols-[240px_1fr]">
        <Sidebar className="min-h-0">
          <SidebarContent>
            <SidebarGroup>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton isActive>
                    <Boxes className="size-4" />
                    Projects
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

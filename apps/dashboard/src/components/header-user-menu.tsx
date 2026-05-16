import { LogOut, UserRound } from 'lucide-react'

import { Button } from '@openbika/ui/components/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@openbika/ui/components/dropdown-menu'
import { cn } from '@openbika/ui/lib/utils'

import type { AuthUser } from '#/auth-session'

function userInitials(user: AuthUser): string {
  const fromName = user.name.trim()
  if (fromName) {
    const parts = fromName.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
    }
    return fromName.slice(0, 2).toUpperCase()
  }
  return user.email.slice(0, 2).toUpperCase()
}

export interface HeaderUserMenuProps {
  className?: string
  onSignOut: () => void | Promise<void>
  user: AuthUser | null
}

export function HeaderUserMenu({
  className,
  onSignOut,
  user,
}: HeaderUserMenuProps) {
  if (!user) {
    return (
      <Button
        aria-label="Account"
        className={cn('size-9 shrink-0 rounded-full', className)}
        disabled
        size="icon"
        type="button"
        variant="outline"
      >
        <UserRound className="size-4 opacity-50" />
      </Button>
    )
  }

  const displayName = user.name.trim() || user.email
  const initials = userInitials(user)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Account menu"
          className={cn(
            'size-9 shrink-0 overflow-hidden rounded-full p-0',
            className,
          )}
          type="button"
          variant="outline"
        >
          {user.image ? (
            <img
              alt=""
              className="size-full object-cover"
              height={36}
              src={user.image}
              width={36}
            />
          ) : (
            <span className="font-medium text-xs">{initials}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col gap-0.5">
            <span className="truncate font-medium text-sm">{displayName}</span>
            <span className="truncate text-muted-foreground text-xs">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void onSignOut()}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

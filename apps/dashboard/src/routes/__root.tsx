import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'

import type { AuthSnapshot } from '#/auth-session'
import { getAuthSessionFn } from '#/auth-session'

import '../styles.css'

export interface RouterAuthContext {
  auth: AuthSnapshot
}

export const Route = createRootRouteWithContext<RouterAuthContext>()({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Openbika',
      },
    ],
  }),
  beforeLoad: async () => {
    const auth = await getAuthSessionFn()
    return { auth }
  },
  pendingComponent: SessionPending,
  shellComponent: RootDocument,
})

function SessionPending() {
  return (
    <div className="text-muted-foreground flex min-h-dvh items-center justify-center p-6 text-sm">
      Loading session…
    </div>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <TanStackDevtools
          config={{
            position: 'bottom-right',
          }}
          plugins={[
            {
              name: 'Tanstack Router',
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
        <Scripts />
      </body>
    </html>
  )
}

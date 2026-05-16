import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { QueryClientProvider } from '@tanstack/react-query'
import type { QueryClient } from '@tanstack/react-query'

import type { AuthSnapshot } from '#/auth-session'
import { getAuthSessionFn } from '#/auth-session'

import { SessionLoadingCenter } from '#/components/loading-placeholders'
import { dashboardQueryClient } from '#/lib/dashboard-query-client'

import '../styles.css'

export interface RouterAppContext {
  auth: AuthSnapshot
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
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
  return <SessionLoadingCenter />
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={dashboardQueryClient}>
          {children}
        </QueryClientProvider>
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

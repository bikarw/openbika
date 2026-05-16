import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { emptyAuth } from '#/auth-session'
import { dashboardQueryClient } from '#/lib/dashboard-query-client'

import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    context: {
      auth: emptyAuth(),
      queryClient: dashboardQueryClient,
    },
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadDelay: 100,
    defaultPreloadStaleTime: 0,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

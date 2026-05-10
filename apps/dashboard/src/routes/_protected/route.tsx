import { Outlet, createFileRoute, redirect } from '@tanstack/react-router'

import { AUTH_REDIRECT_SEARCH_PARAM } from '#/auth-client'

export const Route = createFileRoute('/_protected')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.user) {
      throw redirect({
        to: '/login',
        search: {
          [AUTH_REDIRECT_SEARCH_PARAM]:
            location.pathname + (location.searchStr ?? ''),
        },
      })
    }
  },
  component: () => <Outlet />,
})

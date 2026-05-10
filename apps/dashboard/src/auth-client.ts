import { createAuthClient } from 'better-auth/react'

/** API origin (Better Auth appends `/api/auth`). */
export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
}

/** Query param carrying post-login navigation target (path + optional query). */
export const AUTH_REDIRECT_SEARCH_PARAM = 'redirect'

export const authClient = createAuthClient({
  baseURL: getApiBaseUrl(),
})

/**
 * Returns a same-origin relative path safe to redirect to after auth.
 * Rejects protocol-relative and absolute URLs.
 */
export function getSafeRedirectPath(
  raw: string | undefined,
  fallback = '/',
): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return fallback
  }
  return raw
}

export function loginHrefWithRedirect(returnTo: string): {
  to: '/login'
  search: { redirect: string }
} {
  return {
    to: '/login',
    search: { redirect: returnTo },
  }
}

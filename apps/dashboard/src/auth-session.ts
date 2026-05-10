import { createServerFn } from '@tanstack/react-start'

/** Mirrors Better Auth `/api/auth/get-session` payload used by the dashboard. */
export type AuthUser = {
  id: string
  email: string
  name: string
  image?: string | null
}

/** Serializable snapshot stored in router context (SSR/dehydration safe). */
export type AuthSnapshot = {
  user: AuthUser | null
}

export function emptyAuth(): AuthSnapshot {
  return { user: null }
}

function normalizeAuth(json: unknown): AuthSnapshot {
  if (!json || typeof json !== 'object') return emptyAuth()
  const body = json as Record<string, unknown>
  const rawUser = body.user
  if (!rawUser || typeof rawUser !== 'object') return emptyAuth()
  const u = rawUser as Record<string, unknown>
  if (typeof u.id !== 'string' || typeof u.email !== 'string') return emptyAuth()
  return {
    user: {
      id: u.id,
      email: u.email,
      name: typeof u.name === 'string' ? u.name : '',
      image: typeof u.image === 'string' ? u.image : null,
    },
  }
}

/**
 * Loads the Better Auth session once per router navigation (root `beforeLoad`).
 * Uses TanStack Start `createServerFn` so SSR and RPC forward the incoming Cookie header to the API.
 */
export const getAuthSessionFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AuthSnapshot> => {
    const { getRequest } = await import('@tanstack/react-start/server')
    const cookie = getRequest().headers.get('cookie') ?? ''
    const base = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(
      /\/$/,
      '',
    )
    const url = `${base}/api/auth/get-session`

    const res = await fetch(url, {
      headers: cookie ? { cookie } : {},
      credentials: 'include',
    })

    if (!res.ok) return emptyAuth()

    try {
      return normalizeAuth(await res.json())
    } catch {
      return emptyAuth()
    }
  },
)

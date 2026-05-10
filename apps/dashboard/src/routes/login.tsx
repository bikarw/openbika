import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { useState } from 'react'

import {
  AUTH_REDIRECT_SEARCH_PARAM,
  authClient,
  getSafeRedirectPath,
} from '#/auth-client'
import { Button } from '@openbika/ui/components/button'
import { cn } from '@openbika/ui/lib/utils'

export const Route = createFileRoute('/login')({
  validateSearch: (
    raw: Record<string, unknown>,
  ): { [AUTH_REDIRECT_SEARCH_PARAM]?: string } => ({
    [AUTH_REDIRECT_SEARCH_PARAM]:
      typeof raw[AUTH_REDIRECT_SEARCH_PARAM] === 'string'
        ? raw[AUTH_REDIRECT_SEARCH_PARAM]
        : undefined,
  }),
  beforeLoad: ({ context }) => {
    if (context.auth.user) {
      throw redirect({ to: '/' })
    }
  },
  component: LoginPage,
})

function fieldClassName(): string {
  return cn(
    'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors',
    'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
    'disabled:cursor-not-allowed disabled:opacity-50',
  )
}

function LoginPage() {
  const navigate = useNavigate({ from: '/login' })
  const router = useRouter()
  const redirectParam = Route.useSearch()[AUTH_REDIRECT_SEARCH_PARAM]

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { error: signError } = await authClient.signIn.email({
        email,
        password,
      })
      if (signError) {
        setError(signError.message ?? 'Sign in failed')
        return
      }
      await router.invalidate()
      const destination = getSafeRedirectPath(redirectParam, '/')
      await navigate({ to: destination })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">Log in</h1>
        <p className="text-muted-foreground text-sm">
          Sign in with your email and password.
        </p>
      </div>
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="login-email">
            Email
          </label>
          <input
            id="login-email"
            autoComplete="email"
            className={fieldClassName()}
            name="email"
            onChange={(e) => setEmail(e.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="login-password">
            Password
          </label>
          <input
            id="login-password"
            autoComplete="current-password"
            className={fieldClassName()}
            name="password"
            onChange={(e) => setPassword(e.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <Button className="w-full" disabled={busy} type="submit">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        Don&apos;t have an account?{' '}
        <Link
          className="text-primary font-medium underline underline-offset-4"
          to="/signup"
        >
          Sign up
        </Link>
      </p>
      <p className="text-muted-foreground text-center text-sm">
        <Link
          className="text-primary font-medium underline underline-offset-4"
          to="/home"
        >
          Back to home
        </Link>
      </p>
    </div>
  )
}

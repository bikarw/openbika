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

export const Route = createFileRoute('/signup')({
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
  component: SignupPage,
})

function fieldClassName(): string {
  return cn(
    'flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none transition-colors',
    'placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
    'disabled:cursor-not-allowed disabled:opacity-50',
  )
}

function SignupPage() {
  const navigate = useNavigate({ from: '/signup' })
  const router = useRouter()
  const redirectParam = Route.useSearch()[AUTH_REDIRECT_SEARCH_PARAM]

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const { error: signError } = await authClient.signUp.email({
        email,
        name,
        password,
      })
      if (signError) {
        setError(signError.message ?? 'Sign up failed')
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
        <h1 className="text-xl font-semibold tracking-tight">Sign up</h1>
        <p className="text-muted-foreground text-sm">
          Create an account with email and password.
        </p>
      </div>
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="signup-name">
            Name
          </label>
          <input
            id="signup-name"
            autoComplete="name"
            className={fieldClassName()}
            name="name"
            onChange={(e) => setName(e.target.value)}
            required
            type="text"
            value={name}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="signup-email">
            Email
          </label>
          <input
            id="signup-email"
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
          <label className="text-sm font-medium" htmlFor="signup-password">
            Password
          </label>
          <input
            id="signup-password"
            autoComplete="new-password"
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
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link
          className="text-primary font-medium underline underline-offset-4"
          to="/login"
        >
          Log in
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

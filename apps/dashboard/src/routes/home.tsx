import { createFileRoute, Link } from '@tanstack/react-router'
import { buttonVariants } from '@openbika/ui/components/button'
import { cn } from '@openbika/ui/lib/utils'

export const Route = createFileRoute('/home')({
  component: Home,
})

function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Openbika
        </h1>
        <p className="text-muted-foreground text-sm">
          Sign in to open the app, or create an account.
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link
          className={cn(buttonVariants({ variant: 'default' }), 'justify-center')}
          to="/login"
        >
          Log in
        </Link>
        <Link
          className={cn(buttonVariants({ variant: 'outline' }), 'justify-center')}
          to="/signup"
        >
          Sign up
        </Link>
        <Link
          className={cn(buttonVariants({ variant: 'secondary' }), 'justify-center')}
          to="/"
        >
          Open app
        </Link>
      </div>
    </div>
  )
}

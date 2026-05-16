import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@openbika/ui/components/card"
import { Skeleton } from "@openbika/ui/components/skeleton"
import { cn } from "@openbika/ui/lib/utils"

export function OrgSwitcherLoadingLines() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading organizations"
      className="grid min-w-0 flex-1 gap-1.5 text-left text-sm leading-tight"
      role="status"
    >
      <Skeleton className="h-4 w-[min(12rem,55vw)]" />
      <Skeleton className="h-3 w-[min(8rem,40vw)]" />
    </div>
  )
}

export function ProjectSwitcherLoadingLines() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading projects"
      className="grid min-w-0 flex-1 gap-1.5 text-left text-sm leading-tight"
      role="status"
    >
      <Skeleton className="h-4 w-[min(11rem,50vw)]" />
      <Skeleton className="h-3 w-[min(6.5rem,38vw)]" />
    </div>
  )
}

export function ProjectCardSkeleton() {
  return (
    <Card className="h-full overflow-hidden">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-[min(14rem,70%)]" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardFooter className="flex-wrap gap-2">
        <Skeleton className="h-6 w-20 rounded-md" />
        <Skeleton className="h-6 w-14 rounded-md" />
        <Skeleton className="h-6 w-14 rounded-md" />
        <Skeleton className="ml-auto h-6 w-16 rounded-md" />
      </CardFooter>
    </Card>
  )
}

export function ProjectsPanelGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading projects"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      role="status"
    >
      {Array.from({ length: count }, (_, i) => (
        <ProjectCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function ProjectWorkspaceRouteSkeleton({
  className,
}: {
  className?: string
}) {
  return (
    <div
      className={cn("flex flex-col gap-3 px-4 py-4 md:px-5 md:py-5", className)}
      role="status"
      aria-busy="true"
      aria-label="Loading project"
    >
      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full max-w-md" />
          <div className="flex flex-wrap gap-2 pt-1">
            <Skeleton className="h-6 w-24 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function ProjectMainViewSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading project"
      className="flex flex-col gap-6"
      role="status"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-8 w-[min(20rem,90vw)]" />
          <Skeleton className="h-4 w-[min(28rem,100%)]" />
        </div>
        <Skeleton className="h-9 w-36 shrink-0 sm:mt-0" />
      </div>
      <Card>
        <CardContent className="py-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl" />
            <Skeleton className="h-36 rounded-xl sm:col-span-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export function SessionLoadingCenter() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading session"
      className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6"
      role="status"
    >
      <Skeleton className="h-10 w-40" />
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-3 w-32" />
    </div>
  )
}

export function LogPaneSkeletonLines({ lines = 6 }: { lines?: number }) {
  const widths = ["w-full", "w-[92%]", "w-[88%]", "w-[95%]", "w-[70%]", "w-[84%]", "w-[78%]", "w-[90%]"]
  return (
    <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading output">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          className={cn("h-3 rounded-sm", widths[i % widths.length])}
          key={i}
        />
      ))}
    </div>
  )
}

export function TablesSidebarSkeleton() {
  return (
    <div className="space-y-4 px-2 py-1" role="status" aria-busy="true" aria-label="Loading tables">
      {[0, 1].map((group) => (
        <div className="space-y-2" key={group}>
          <div className="flex items-center gap-2 px-2">
            <Skeleton className="size-3.5 shrink-0 rounded" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="space-y-1.5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton className="h-9 w-full rounded-lg" key={i} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function TablePreviewSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading table preview"
      className="p-4"
      role="status"
    >
      <div className="space-y-2 overflow-hidden rounded-md border border-border">
        <div className="flex gap-2 border-border border-b bg-muted/30 p-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton className="h-6 min-w-[4.5rem] flex-1 rounded" key={i} />
          ))}
        </div>
        {Array.from({ length: 8 }, (_, row) => (
          <div className="flex gap-2 px-2 py-1.5" key={row}>
            {Array.from({ length: 5 }, (_, col) => (
              <Skeleton
                className="h-4 min-w-[4.5rem] flex-1 rounded-sm"
                key={col}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SchemaStatusSkeleton() {
  return (
    <div className="flex items-center gap-2" role="status" aria-busy="true" aria-label="Loading schema">
      <Skeleton className="h-5 w-36 rounded-full" />
      <Skeleton className="h-3 w-48 max-w-[min(12rem,40vw)]" />
    </div>
  )
}

export function HeaderStatusBadgeSkeleton() {
  return (
    <Skeleton
      aria-busy="true"
      aria-label="Checking service status"
      className="h-6 w-28 rounded-full"
    />
  )
}

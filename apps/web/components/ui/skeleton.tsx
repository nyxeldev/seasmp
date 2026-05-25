import { cn } from '@/lib/utils'

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md', className)}
      style={{ background: 'var(--s-border)' }}
      {...props}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="rounded-xl border p-5 flex flex-col gap-4"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="size-10 rounded-full shrink-0" />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton className="size-6 rounded-full" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex items-center justify-between pt-3 border-t"
        style={{ borderColor: 'var(--s-border)' }}>
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b"
      style={{ borderColor: 'var(--s-border)' }}>
      <Skeleton className="size-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-5 w-16 rounded-full" />
    </div>
  )
}

export function SkeletonKpi() {
  return (
    <div className="rounded-xl border p-5 space-y-3"
      style={{ background: 'var(--s-bg-card)', borderColor: 'var(--s-border)' }}>
      <div className="flex items-start justify-between">
        <Skeleton className="size-9 rounded-lg" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <div className="space-y-1">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-3 w-28" />
      </div>
    </div>
  )
}

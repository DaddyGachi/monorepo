import { cn } from '@/lib/utils'

/**
 * A placeholder shape. Hidden from assistive technology by default — the shapes
 * carry no information, and the fetch itself is announced by `LoadingState` /
 * `LoadingAnnouncer` in `data-state.tsx`.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn('bg-accent animate-pulse rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }

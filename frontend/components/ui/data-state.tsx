"use client";

import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared loading / empty / error primitives.
 *
 * Every asynchronous surface in the app resolves to exactly one of four states,
 * and each state has one component here. See STATE_HANDLING_CONVENTION.md for
 * the decision table and migration notes.
 *
 *   loading -> <LoadingState> (or <LoadingAnnouncer> + bare skeletons)
 *   error   -> <ErrorState onRetry={...}>
 *   empty   -> <EmptyState> with an action that would populate it
 *   ready   -> the surface's own markup
 *
 * Monetary values are the one case where "render something plausible" is a bug
 * rather than a nicety, so they get a dedicated component: <MoneyValue>.
 */

/** The four states any fetched surface can be in. */
export type DataStatus = "loading" | "error" | "empty" | "ready";

/* -------------------------------------------------------------------------- */
/* Loading                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Screen-reader announcement for an in-flight fetch, with no visual box of its
 * own. Use when the skeletons cannot be wrapped — direct children of a grid,
 * table rows, and so on — so the layout stays untouched.
 */
export function LoadingAnnouncer({ label }: { label: string }) {
  return (
    <span role="status" aria-live="polite" className="sr-only">
      {label}
    </span>
  );
}

/**
 * Wraps a block of skeletons: announces the fetch to assistive technology and
 * hides the placeholder shapes from it, since reading them adds nothing.
 *
 * `className` is applied to the visual wrapper, so a caller replacing a grid of
 * skeletons can move the grid classes here and keep the same layout.
 */
export function LoadingState({
  label,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { label: string }) {
  return (
    <>
      <LoadingAnnouncer label={label} />
      <div data-slot="loading-state" aria-hidden="true" className={className} {...props}>
        {children}
      </div>
    </>
  );
}

/**
 * Placeholder for a stat / KPI card. Mirrors the dimensions of the real card so
 * nothing jumps when the value arrives.
 */
export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border-3 border-foreground bg-card p-3 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] md:p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2 md:gap-4">
        <Skeleton className="h-10 w-10 shrink-0 md:h-14 md:w-14" />
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-6 w-24 md:h-8" />
        </div>
      </div>
    </div>
  );
}

/** Placeholder for one row of a list or ledger. */
export function ListRowSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 border-b-2 border-foreground/10 pb-3",
        className,
      )}
    >
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      <div className="space-y-2 text-right">
        <Skeleton className="ml-auto h-4 w-24" />
        <Skeleton className="ml-auto h-5 w-20" />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Error                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * A failed fetch. `onRetry` is required: an error state that tells the user to
 * reload the page throws away everything else on screen to recover one section.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  retryLabel = "Try again",
  className,
}: {
  title?: string;
  description?: ReactNode;
  onRetry: () => void;
  retryLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className={cn(
        "flex flex-col items-start gap-3 border-3 border-destructive bg-destructive/10 p-6 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-bold text-foreground">{title}</p>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
      </div>
      <Button
        type="button"
        onClick={onRetry}
        variant="outline"
        className="border-3 border-foreground bg-background font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
      >
        <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
        {retryLabel}
      </Button>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empty                                                                       */
/* -------------------------------------------------------------------------- */

export type EmptyStateAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

/**
 * A successful fetch that returned nothing. Distinct from loading (no pulse)
 * and from error (no destructive colouring), and carries the action that would
 * populate it — for most surfaces this is a new user's first impression.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: string;
  /** The next step that would fill this surface. Omit only if there isn't one. */
  action?: EmptyStateAction;
  className?: string;
}) {
  const actionClassName =
    "border-3 border-foreground bg-primary font-bold text-primary-foreground shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] transition-all hover:translate-x-0.5 hover:translate-y-0.5 hover:shadow-[1px_1px_0px_0px_rgba(26,26,26,1)]";

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 border-3 border-dashed border-foreground bg-card p-8 text-center",
        className,
      )}
    >
      {Icon ? (
        <Icon className="h-12 w-12 text-muted-foreground" aria-hidden="true" />
      ) : null}
      <div className="space-y-1">
        <p className="text-lg font-bold text-foreground">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action ? (
        action.href ? (
          <Button asChild className={actionClassName}>
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : (
          <Button type="button" onClick={action.onClick} className={actionClassName}>
            {action.label}
          </Button>
        )
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

/** Rendered in place of an amount that is not known. Never a number. */
export const MONEY_UNAVAILABLE = "—";

/**
 * A monetary value that refuses to invent one.
 *
 * A balance or total rendered from a `?? 0` fallback is indistinguishable from
 * a real zero, so a user can be shown — and believe — an amount the server
 * never sent. This component renders a skeleton while loading and an explicit
 * dash when the amount is unknown, and only ever formats a number it was
 * actually given.
 */
export function MoneyValue({
  status,
  amount,
  format,
  className,
  skeletonClassName = "h-7 w-28",
  loadingLabel = "Loading amount",
  unavailableLabel = "Amount unavailable",
}: {
  status: "loading" | "error" | "ready";
  /** The amount. `null`/`undefined` is treated as unknown, never as zero. */
  amount: number | null | undefined;
  format: (amount: number) => string;
  className?: string;
  skeletonClassName?: string;
  loadingLabel?: string;
  unavailableLabel?: string;
}) {
  if (status === "loading") {
    return (
      <span className={cn("inline-flex items-center", className)}>
        <LoadingAnnouncer label={loadingLabel} />
        <Skeleton className={skeletonClassName} />
      </span>
    );
  }

  if (status === "error" || amount === null || amount === undefined || !Number.isFinite(amount)) {
    return (
      <span
        className={cn("text-muted-foreground", className)}
        title={unavailableLabel}
        data-slot="money-unavailable"
      >
        <span aria-hidden="true">{MONEY_UNAVAILABLE}</span>
        <span className="sr-only">{unavailableLabel}</span>
      </span>
    );
  }

  return (
    <span className={className} data-slot="money-value">
      {format(amount)}
    </span>
  );
}

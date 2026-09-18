import * as React from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { SvgSafe, SvgServerDown } from "iblis-react-undraw";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Prop shape shared by every `iblis-react-undraw` illustration component. */
export type UndrawIllustration = React.ComponentType<{
  height?: number | string;
  primarycolor?: string;
  accentcolor?: string;
  haircolor?: string;
  skincolor?: string;
  /**
   * ⚠️ `className`, not `class` — even though the library's own types say
   * `class`. Its components are built like this:
   *
   *   createElement("svg", __assign(
   *     { viewBox, className: props.class, width: "100%", height: props.height },
   *     props,                       // <- spread AFTER
   *   ), …)
   *
   * So it maps `props.class` onto `className` itself, and THEN spreads the raw
   * props over the top. Passing `class` therefore worked — the styling applied —
   * but also put a literal `class` attribute on a DOM element, which React
   * rejects with "Invalid DOM property `class`. Did you mean `className`?" on
   * every empty state in the app.
   *
   * Passing `className` lands in the same place (the spread overrides the
   * library's own `className`) with no warning. The styling is unchanged: this
   * removes console noise, it did NOT un-squash anything.
   */
  className?: string;
}>;

// Approximates the app's --primary brand color (see src/styles.css), used to
// tint illustrations so they read as "ours" rather than stock artwork.
const BRAND_PRIMARY = "#1b12ca";

interface IllustratedStateProps {
  illustration: UndrawIllustration;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * Widens (or narrows) the description alone. The default 280px suits a short
   * sentence; a state that has to explain a filter or name two platforms reads
   * as a narrow ragged column at that width, so those pass `max-w-[420px]`.
   */
  descriptionClassName?: string;
  size?: "sm" | "default";
  /** Tints the glow behind the illustration. `danger` marks a failure. */
  tone?: "primary" | "danger";
}

/**
 * Layout shell behind `EmptyState` and `ErrorState` — illustration over a soft
 * glow, then title / description / action. Not exported: pick one of the two
 * named states so "nothing here" and "this broke" stay visually distinct.
 */
function IllustratedState({
  illustration: Illustration,
  title,
  description,
  action,
  className,
  descriptionClassName,
  size = "default",
  tone = "primary",
}: IllustratedStateProps) {
  const isSmall = size === "sm";

  return (
    <div
      className={cn(
        "animate-in fade-in-0 zoom-in-95 duration-300 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/10 text-center",
        isSmall ? "px-6 py-8" : "px-8 py-12",
        className,
      )}
    >
      <div className="relative flex items-center justify-center">
        {/* soft glow instead of a boxed card so the illustration reads as
            part of the page, not a cropped thumbnail */}
        <div
          className={cn(
            "absolute rounded-full blur-3xl",
            tone === "danger" ? "bg-danger/10" : "bg-primary/10",
            isSmall ? "size-28" : "size-44",
          )}
        />
        {/* The library hardcodes width="100%" on its svgs, so `w-auto` is what
            lets the height class drive the size and the viewBox keep the aspect
            ratio. Verified rendered: 232×167px against a 1104×797 viewBox —
            1.385 both ways. */}
        <Illustration
          className={cn("relative w-auto drop-shadow-sm", isSmall ? "h-28" : "h-44")}
          primarycolor={BRAND_PRIMARY}
        />
      </div>
      <h3
        className={cn("font-semibold text-foreground", isSmall ? "mt-5 text-sm" : "mt-6 text-base")}
      >
        {title}
      </h3>
      {description && (
        <p
          className={cn(
            "mt-1.5 max-w-[280px] text-muted-foreground",
            isSmall ? "text-xs" : "text-sm",
            descriptionClassName,
          )}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

interface EmptyStateProps {
  illustration: UndrawIllustration;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Widens the description past its default 280px — see `IllustratedState`. */
  descriptionClassName?: string;
  size?: "sm" | "default";
}

/**
 * Shared "nothing here yet" block for lists/tables/panels, illustrated with
 * an unDraw SVG (via iblis-react-undraw). Use `EmptyStateInline` for compact
 * chart/table cells instead.
 *
 * Only for genuinely empty data — when a request *failed*, render `ErrorState`
 * so the user isn't told "no results" for data that may well exist.
 */
export function EmptyState(props: EmptyStateProps) {
  return <IllustratedState {...props} tone="primary" />;
}

interface ErrorStateProps {
  /** Defaults to an unDraw "server down" illustration. */
  illustration?: UndrawIllustration;
  title?: string;
  description?: string;
  /** Renders a Retry button. Pass a query's `refetch`. */
  onRetry?: () => void;
  retryLabel?: string;
  /** Shown while a retry is in flight. */
  isRetrying?: boolean;
  action?: React.ReactNode;
  className?: string;
  /** Widens the description past its default 280px — see `IllustratedState`. */
  descriptionClassName?: string;
  size?: "sm" | "default";
}

/**
 * "We couldn't load this" block — the failure counterpart to `EmptyState`.
 *
 * Render this whenever a query reports `isError`. Falling back to `EmptyState`
 * on failure tells the user there is no data when the request simply did not
 * succeed, and leaves them no way to retry.
 */
export function ErrorState({
  illustration = SvgServerDown as UndrawIllustration,
  title = "Couldn't load this",
  description = "Something went wrong while fetching this data. Check your connection and try again.",
  onRetry,
  retryLabel = "Try again",
  isRetrying = false,
  action,
  className,
  descriptionClassName,
  size = "default",
}: ErrorStateProps) {
  return (
    <IllustratedState
      illustration={illustration}
      title={title}
      description={description}
      className={className}
      descriptionClassName={descriptionClassName}
      size={size}
      tone="danger"
      action={
        action ??
        (onRetry ? (
          <Button variant="outline" size={size === "sm" ? "sm" : "default"} onClick={onRetry}>
            <RotateCw className={cn("size-4", isRetrying && "animate-spin")} />
            {isRetrying ? "Retrying…" : retryLabel}
          </Button>
        ) : undefined)
      }
    />
  );
}

interface PermissionDeniedStateProps {
  /** What the user was trying to see, lower-case — "leads", "applications". */
  entityLabel?: string;
  /** Overrides the generic "ask your administrator" line with page-specific copy. */
  description?: string;
  className?: string;
  /** Widens the description past its default 280px — see `IllustratedState`. */
  descriptionClassName?: string;
  size?: "sm" | "default";
}

/**
 * The 403 counterpart to `ErrorState`. A permission denial isn't a transient
 * failure, so this deliberately offers no retry button and doesn't blame the
 * network — it tells the user who can fix it.
 *
 * Illustrated with a padlock, never the 404 artwork: the page exists and the
 * data is there, it's just locked, and showing "404" for a denial reads as a
 * broken link and sends people hunting for a URL that was never wrong.
 */
export function PermissionDeniedState({
  entityLabel,
  description = "Your account is missing the permission for this. Ask your administrator to grant it.",
  className,
  descriptionClassName,
  size = "default",
}: PermissionDeniedStateProps) {
  return (
    <IllustratedState
      illustration={SvgSafe as UndrawIllustration}
      title={entityLabel ? `You don't have access to ${entityLabel}` : "You don't have access"}
      description={description}
      className={className}
      descriptionClassName={descriptionClassName}
      size={size}
      tone="danger"
    />
  );
}

interface EmptyStateInlineProps {
  icon?: React.ElementType;
  message: string;
  className?: string;
}

/** Compact single-line empty state for chart/table cells and dashboard widgets. */
export function EmptyStateInline({ icon: Icon, message, className }: EmptyStateInlineProps) {
  return (
    <div
      className={cn(
        "animate-in fade-in-0 duration-300 flex h-full min-h-32 flex-col items-center justify-center gap-2 text-muted-foreground",
        className,
      )}
    >
      {Icon && <Icon className="size-4 opacity-60" strokeWidth={1.75} />}
      <span className="text-[13px]">{message}</span>
    </div>
  );
}

interface ErrorStateInlineProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Compact failure state for chart/table cells and dashboard widgets — the
 * counterpart to `EmptyStateInline`, for when the widget's query errored rather
 * than returning nothing.
 */
export function ErrorStateInline({
  message = "Couldn't load this data",
  onRetry,
  className,
}: ErrorStateInlineProps) {
  return (
    <div
      className={cn(
        "animate-in fade-in-0 duration-300 flex h-full min-h-32 flex-col items-center justify-center gap-2 text-muted-foreground",
        className,
      )}
    >
      <TriangleAlert className="size-4 text-danger opacity-80" strokeWidth={1.75} />
      <span className="text-[13px]">{message}</span>
      {onRetry && (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onRetry}>
          <RotateCw className="size-3.5" />
          Try again
        </Button>
      )}
    </div>
  );
}

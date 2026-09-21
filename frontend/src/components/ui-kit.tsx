import { ReactNode, HTMLAttributes, useContext, useState } from "react";
import { ArrowLeft, RotateCw } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { PageHeaderAfterTitleContext } from "@/components/page-header-after-title";

export function PageHeader({
  title,
  subtitle,
  actions,
  handleBack,
  onRefresh,
  titleExtra,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumb?: string;
  handleBack?: () => void;
  className?: string;
  /** Return the refetch promise so the button can show it working. */
  onRefresh?: () => void | Promise<unknown>;
  titleExtra?: ReactNode;
}) {
  const afterTitle = useContext(PageHeaderAfterTitleContext);
  return (
    <div
      className={cn(
        "flex flex-col gap-3 py-2 px-3 md:h-11.75 md:flex-row md:items-center md:justify-between md:gap-4",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {handleBack && (
          <button
            type="button"
            onClick={() => handleBack()}
            className="text-muted-foreground hover:text-foreground transition cursor-pointer shrink-0"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-display text-md font-medium leading-4 truncate">{title}</h1>
            {titleExtra && <div className="shrink-0">{titleExtra}</div>}
            {afterTitle}
            {onRefresh && <RefreshButton onRefresh={onRefresh} />}
          </div>
          {subtitle ? <p className="text-xs text-muted-foreground truncate">{subtitle}</p> : null}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

/** Spins while the refresh runs, then says "Updated" for a moment, so a click is visibly answered. */
function RefreshButton({ onRefresh }: { onRefresh: () => void | Promise<unknown> }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  async function run() {
    if (state === "busy") return;
    setState("busy");
    const started = Date.now();
    try {
      await onRefresh();
    } finally {
      // Long enough to see, even when the answer is instant.
      await new Promise((r) => setTimeout(r, Math.max(0, 400 - (Date.now() - started))));
      setState("done");
      setTimeout(() => setState("idle"), 1500);
    }
  }
  return (
    <span className="flex items-center gap-1">
      <Button
        onClick={() => void run()}
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
        aria-label="Refresh"
        disabled={state === "busy"}
      >
        <RotateCw className={cn("size-3.5", state === "busy" && "animate-spin")} />
      </Button>
      {state === "done" ? <span className="text-[11px] text-muted-foreground">Updated</span> : null}
    </span>
  );
}

export function Card({ children, className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-xl bg-card border border-border shadow-elev-1 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
  className = "",
  ...props
}: {
  children: ReactNode;
  className?: string;
  tone?:
    | "muted"
    | "primary"
    | "primary-light"
    | "success"
    | "success-light"
    | "warning"
    | "warning-light"
    | "danger"
    | "danger-light"
    | "info"
    | "info-light"
    | "gold"
    | "gold-light";
} & React.HTMLAttributes<HTMLSpanElement>) {
  const tones: Record<string, string> = {
    muted: "bg-muted text-muted-foreground dark:bg-white/8 dark:text-foreground/80",
    primary: "bg-primary/15 text-primary dark:bg-primary/25 dark:text-primary-light",
    "primary-light": "border border-primary/30 text-primary bg-primary/10 dark:bg-primary/15",
    success: "bg-success/15 text-success dark:bg-success/20",
    "success-light": "border border-success/30 text-success bg-success/10",
    warning: "bg-warning/15 text-warning dark:bg-warning/15",
    "warning-light": "border border-warning/30 text-warning bg-warning/10",
    danger: "bg-danger/15 text-danger dark:bg-danger/20",
    "danger-light": "border border-danger/30 text-danger bg-danger/10",
    info: "bg-info/15 text-info dark:bg-info/20",
    "info-light": "border border-info/30 text-info bg-info/10",
    gold: "bg-gold/20 text-gold dark:bg-gold/15",
    "gold-light": "border border-gold/30 text-gold bg-gold/10",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "primary",
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  icon?: ReactNode;
  accent?: "primary" | "success" | "warning" | "gold" | "info" | "danger";
}) {
  const accents: Record<string, string> = {
    primary: "from-primary/10 to-primary/0 text-primary",
    success: "from-success/15 to-success/0 text-success",
    warning: "from-warning/15 to-warning/0 text-warning",
    gold: "from-gold/20 to-gold/0 text-gold",
    info: "from-info/15 to-info/0 text-info",
    danger: "from-danger/15 to-danger/0 text-danger",
  };
  return (
    <Card className="relative overflow-hidden p-4">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br opacity-70", accents[accent])} />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold leading-none text-foreground">{value}</p>
          {hint ? <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? <div className={cn("shrink-0 rounded-lg bg-background/60 p-2", accents[accent])}>{icon}</div> : null}
      </div>
    </Card>
  );
}

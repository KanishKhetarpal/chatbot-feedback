import { motion } from "motion/react";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { EASE_OUT_QUART, SPRING_SETTLE, SPRING_SNAPPY } from "@/lib/ui-constants";

// ── Shared motion primitives ─────────────────────────────────────────────────
// Reveal (blur-up entrance), AnimatedNumber (rolling odometer digits) and
// TabIndicator (flying underline) — the building blocks the signature
// animations are composed from. Grouped in one file on purpose.

/**
 * Blur-up entrance for content replacing a skeleton or arriving on scroll.
 * `inView` defers the animation until the element scrolls into the viewport
 * (plays once); otherwise it plays on mount.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  inView = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  inView?: boolean;
}) {
  const hidden = { opacity: 0, y: 18, filter: "blur(8px)" };
  const shown = { opacity: 1, y: 0, filter: "blur(0px)" };
  return (
    <motion.div
      className={className}
      initial={hidden}
      {...(inView
        ? { whileInView: shown, viewport: { once: true, margin: "-40px" } }
        : { animate: shown })}
      transition={{ duration: 0.45, ease: EASE_OUT_QUART, delay }}
    >
      {children}
    </motion.div>
  );
}

const DIGIT_COLUMN = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

function RollingDigit({ digit }: { digit: string }) {
  return (
    <span
      aria-hidden
      className="relative inline-block overflow-hidden"
      style={{ width: "1ch", height: "1em" }}
    >
      <motion.span
        className="absolute left-0 top-0 flex flex-col items-center"
        initial={{ y: 0 }}
        animate={{ y: `${-Number(digit)}em` }}
        transition={SPRING_SETTLE}
      >
        {DIGIT_COLUMN.map((d) => (
          <span key={d} style={{ height: "1em", lineHeight: "1em" }}>
            {d}
          </span>
        ))}
      </motion.span>
    </span>
  );
}

/**
 * Odometer-style number: each digit is a rolling column that spins from 0 into
 * place on mount and ticks to the new value when the data refetches. Non-digit
 * characters (₹ , % . +) render statically, so pre-formatted strings work.
 * Digits are keyed from the right so "99 → 100" rolls sensibly.
 */
export function AnimatedNumber({
  value,
  className,
}: {
  value: string | number;
  className?: string;
}) {
  const text = String(value);
  const chars = text.split("");
  return (
    <span className={cn("inline-flex tabular-nums whitespace-nowrap", className)} aria-label={text}>
      {chars.map((char, i) => {
        const keyFromRight = chars.length - i;
        return /\d/.test(char) ? (
          <RollingDigit key={`d-${keyFromRight}`} digit={char} />
        ) : (
          <span
            key={`c-${keyFromRight}-${char}`}
            aria-hidden
            style={{ height: "1em", lineHeight: "1em" }}
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Flying underline for tab strips: render inside every trigger (which must be
 * `relative`); the single active one wins and the bar springs between them.
 * Give each independent tab strip its own `layoutId`.
 */
export function TabIndicator({
  active,
  layoutId,
  className,
}: {
  active: boolean;
  layoutId: string;
  className?: string;
}) {
  if (!active) return null;
  return (
    <motion.span
      layoutId={layoutId}
      transition={SPRING_SNAPPY}
      className={cn("absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary", className)}
    />
  );
}

/**
 * Flying background pill for segmented/pill tab strips: render inside every
 * trigger (which must be `relative`) and keep the label above it with
 * `relative z-10`; the single active one wins and the pill springs between
 * tabs. Give each independent strip its own `layoutId`.
 */
export function TabPill({
  active,
  layoutId,
  className,
}: {
  active: boolean;
  layoutId: string;
  className?: string;
}) {
  if (!active) return null;
  return (
    <motion.span
      layoutId={layoutId}
      transition={SPRING_SNAPPY}
      className={cn("absolute inset-0 rounded-full bg-background shadow-sm", className)}
    />
  );
}

const ANIMATED_TABS_VARIANTS = {
  pill: {
    list: "h-auto w-max rounded-full bg-muted p-1",
    trigger:
      "relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
  },
  underline: {
    list: "h-auto w-max justify-start gap-5 rounded-none bg-transparent p-0",
    trigger:
      "relative rounded-none px-0 pb-2.5 text-[14px] font-medium transition-colors duration-200 data-[state=active]:bg-transparent data-[state=active]:shadow-none",
  },
} as const;

/**
 * Radix `TabsList` with the house sliding-indicator animation: `pill` flies the
 * active background pill between triggers, `underline` flies the bar beneath
 * them. Must live inside a `Tabs` root; pass the controlled value as
 * `activeValue` and a strip-unique `layoutId`.
 */
export function AnimatedTabsList({
  tabs,
  activeValue,
  layoutId,
  variant = "pill",
  className,
  triggerClassName,
  indicatorClassName,
}: {
  tabs: ReadonlyArray<{ value: string; label: string }>;
  activeValue: string;
  layoutId: string;
  variant?: "pill" | "underline";
  className?: string;
  triggerClassName?: string;
  indicatorClassName?: string;
}) {
  const styles = ANIMATED_TABS_VARIANTS[variant];
  return (
    <TabsList className={cn(styles.list, className)}>
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab.value}
          value={tab.value}
          className={cn(styles.trigger, triggerClassName)}
        >
          {variant === "pill" ? (
            <>
              <TabPill
                active={activeValue === tab.value}
                layoutId={layoutId}
                className={indicatorClassName}
              />
              <span className="relative z-10">{tab.label}</span>
            </>
          ) : (
            <>
              <TabIndicator
                active={activeValue === tab.value}
                layoutId={layoutId}
                className={indicatorClassName}
              />
              {tab.label}
            </>
          )}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

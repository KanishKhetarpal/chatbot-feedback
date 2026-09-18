/**
 * Small dependency-free charts for the admin pages. SVG, themed from the app
 * tokens, with a native tooltip per bar — enough to read a trend without
 * pulling in a charting library for two screens.
 */

import { cn } from "@/lib/utils";

export type BarSeries = { key: string; label: string; color: string };

export function StackedBars({
  data,
  series,
  height = 160,
  format = (n) => String(n),
  className,
  emptyLabel = "Nothing in this range yet",
}: {
  /** One entry per column, in order. `values` keyed by series key. */
  data: { label: string; title?: string; values: Record<string, number> }[];
  series: BarSeries[];
  height?: number;
  format?: (n: number) => string;
  className?: string;
  emptyLabel?: string;
}) {
  const totals = data.map((d) => series.reduce((s, k) => s + (d.values[k.key] ?? 0), 0));
  const max = Math.max(...totals, 0);
  const n = data.length || 1;
  const gap = n > 40 ? 1 : n > 20 ? 2 : 4;
  const width = 600;
  const barW = Math.max(2, (width - gap * (n - 1)) / n);
  const labelEvery = n > 40 ? Math.ceil(n / 8) : n > 14 ? Math.ceil(n / 7) : 1;

  return (
    <div className={cn("relative", className)}>
      {max === 0 ? (
        <p className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">{emptyLabel}</p>
      ) : null}
      <svg viewBox={`0 0 ${width} ${height + 18}`} className="block w-full" preserveAspectRatio="none" style={{ height: height + 18 }}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={height - height * f}
            y2={height - height * f}
            className="stroke-border"
            strokeWidth={1}
            strokeDasharray="2 4"
          />
        ))}
        {data.map((d, i) => {
          let y = height;
          const x = i * (barW + gap);
          const title = `${d.title ?? d.label}\n${series.map((s) => `${s.label}: ${format(d.values[s.key] ?? 0)}`).join("\n")}`;
          return (
            <g key={d.label + i}>
              <title>{title}</title>
              {series.map((s) => {
                const v = d.values[s.key] ?? 0;
                const h = max ? (v / max) * height : 0;
                y -= h;
                return v > 0 ? <rect key={s.key} x={x} y={y} width={barW} height={h} fill={s.color} rx={barW > 6 ? 2 : 0} /> : null;
              })}
              <rect x={x} y={0} width={barW} height={height} fill="transparent" />
              {i % labelEvery === 0 ? (
                <text x={x + barW / 2} y={height + 13} textAnchor="middle" className="fill-muted-foreground" fontSize={10}>
                  {d.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
        {max > 0 ? <span className="ml-auto text-[11px] text-muted-foreground">peak {format(max)}</span> : null}
      </div>
    </div>
  );
}

/** A horizontal bar per row, widest first, for "by reason" / "by tester" lists. */
export function HBars({
  rows,
  color = "var(--color-primary)",
  format = (n) => String(n),
  emptyLabel = "None yet",
}: {
  rows: { label: string; value: number; hint?: string }[];
  color?: string;
  format?: (n: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 0);
  if (!rows.length || max === 0) return <p className="py-3 text-xs text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="text-xs">
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{r.label}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {format(r.value)}
              {r.hint ? <span className="ml-1 opacity-70">{r.hint}</span> : null}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

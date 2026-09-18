/**
 * What Claude costs this app: every call's four token kinds, summed by day,
 * chatbot, model and operation, priced from the backend's price table. The
 * ledger is written behind the Anthropic client, so nothing is missing.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Coins, Database, ExternalLink, Gauge, Timer, Zap } from "lucide-react";

import { useGetAiUsage } from "@/components/chat-agents/hook/query/use-get-ai-usage";
import { useGetChatAgents } from "@/components/chat-agents/hook/query/use-get-chat-agents";
import { StackedBars } from "@/components/charts/bars";
import { Card, PageHeader, StatCard } from "@/components/ui-kit";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/axios-config";
import { cn } from "@/lib/utils";
import type { UsageBucket } from "@/types/chat-agent-types";

const RANGES = [7, 30, 90] as const;
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");
const tok = (n: number) => compact.format(n);
const usd = (n: number) => (n === 0 ? "$0" : n < 0.01 ? `$${n.toFixed(4)}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" });

const OPERATION_LABEL: Record<string, string> = {
  "widget.chat": "Chat replies",
  "widget.test": "Builder test chat",
  "agent.warm-cache": "Training (cache warm)",
  "agent.count-tokens": "Token count",
};
const opLabel = (op: string) => OPERATION_LABEL[op] ?? op;

const SERIES = [
  { key: "inputTokens", label: "Input", color: "var(--color-primary)" },
  { key: "cacheReadTokens", label: "Cache read", color: "var(--color-info)" },
  { key: "cacheWriteTokens", label: "Cache write", color: "var(--color-warning)" },
  { key: "outputTokens", label: "Output", color: "var(--color-success)" },
];

function UsageTable<T extends UsageBucket>({
  rows,
  first,
  firstLabel,
}: {
  rows: T[];
  first: (row: T) => React.ReactNode;
  firstLabel: string;
}) {
  if (!rows.length) return <p className="py-3 text-xs text-muted-foreground">No calls in this range.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
          <tr>
            <th className="pb-2 font-semibold">{firstLabel}</th>
            <th className="pb-2 text-right font-semibold">Calls</th>
            <th className="pb-2 text-right font-semibold">Input</th>
            <th className="pb-2 text-right font-semibold">Cache read</th>
            <th className="pb-2 text-right font-semibold">Cache write</th>
            <th className="pb-2 text-right font-semibold">Output</th>
            <th className="pb-2 text-right font-semibold">Total</th>
            <th className="pb-2 text-right font-semibold">Cache hit</th>
            <th className="pb-2 text-right font-semibold">Latency</th>
            <th className="pb-2 text-right font-semibold">Est. cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-2 font-medium">{first(r)}</td>
              <td className="py-2 text-right tabular-nums">{full.format(r.calls)}</td>
              <td className="py-2 text-right tabular-nums" title={full.format(r.inputTokens)}>{tok(r.inputTokens)}</td>
              <td className="py-2 text-right tabular-nums" title={full.format(r.cacheReadTokens)}>{tok(r.cacheReadTokens)}</td>
              <td className="py-2 text-right tabular-nums" title={full.format(r.cacheWriteTokens)}>{tok(r.cacheWriteTokens)}</td>
              <td className="py-2 text-right tabular-nums" title={full.format(r.outputTokens)}>{tok(r.outputTokens)}</td>
              <td className="py-2 text-right font-semibold tabular-nums" title={full.format(r.totalTokens)}>{tok(r.totalTokens)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{pct(r.cacheHitRate)}</td>
              <td className="py-2 text-right tabular-nums text-muted-foreground">{r.avgLatencyMs != null ? `${(r.avgLatencyMs / 1000).toFixed(1)}s` : "—"}</td>
              <td className="py-2 text-right font-semibold tabular-nums">{usd(r.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UsageView() {
  const { data: agents = [] } = useGetChatAgents();
  const [agentId, setAgentId] = useState("all");
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const query = useGetAiUsage({ agentId: agentId === "all" ? undefined : agentId, days });
  const d = query.data;
  const t = d?.totals;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Token usage"
        subtitle="Every Claude call, all four token kinds, priced from the list rates."
        onRefresh={() => void query.refetch()}
        actions={
          <>
            <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="h-8 rounded-md border border-border bg-background px-2 text-xs">
              <option value="all">All chatbots</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-md border border-border text-xs">
              {RANGES.map((r) => (
                <button key={r} type="button" onClick={() => setDays(r)} className={cn("px-2.5 py-1.5", days === r ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                  {r}d
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-4">
        {query.isError ? (
          <ErrorState title="Couldn't load usage" description={getErrorMessage(query.error, "Please try again.")} onRetry={() => void query.refetch()} />
        ) : !d || !t ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Total tokens" value={tok(t.totalTokens)} accent="primary" icon={<Database className="size-4" />} hint={`${full.format(t.totalTokens)} · last ${days} days`} />
              <StatCard label="Estimated cost" value={usd(t.costUsd)} accent="gold" icon={<Coins className="size-4" />} hint="list prices, USD" />
              <StatCard label="Calls" value={full.format(t.calls)} accent="info" icon={<Zap className="size-4" />} hint={t.avgTokensPerCall ? `~${tok(t.avgTokensPerCall)} tokens each` : undefined} />
              <StatCard label="Cache hit rate" value={pct(t.cacheHitRate)} accent="success" icon={<Gauge className="size-4" />} hint="share of the prompt served from cache" />
              <StatCard label="Avg latency" value={t.avgLatencyMs != null ? `${(t.avgLatencyMs / 1000).toFixed(1)}s` : "—"} accent="warning" icon={<Timer className="size-4" />} hint="per call" />
            </div>

            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">Tokens by day</p>
              <StackedBars
                height={180}
                format={tok}
                data={d.byDay.map((r) => ({
                  label: dayLabel(r.date),
                  title: `${r.date} · ${r.calls} calls · ${usd(r.costUsd)}`,
                  values: { inputTokens: r.inputTokens, cacheReadTokens: r.cacheReadTokens, cacheWriteTokens: r.cacheWriteTokens, outputTokens: r.outputTokens },
                }))}
                series={SERIES}
              />
            </Card>

            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">By chatbot</p>
              <UsageTable rows={d.byAgent} firstLabel="Chatbot" first={(r) => (r.agent ? r.agent.name : "—")} />
            </Card>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card className="p-4">
                <p className="mb-3 text-sm font-semibold">By model</p>
                <UsageTable rows={d.byModel} firstLabel="Model" first={(r) => r.model} />
              </Card>
              <Card className="p-4">
                <p className="mb-3 text-sm font-semibold">By operation</p>
                <UsageTable rows={d.byOperation} firstLabel="Operation" first={(r) => opLabel(r.operation)} />
                {t.tokenCountCalls ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Plus {full.format(t.tokenCountCalls)} token-count call{t.tokenCountCalls === 1 ? "" : "s"} during training, which Anthropic does not charge for.
                  </p>
                ) : null}
              </Card>
            </div>

            <Card className="p-4">
              <p className="mb-3 text-sm font-semibold">Recent calls</p>
              {d.recent.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No calls in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="pb-2 font-semibold">When</th>
                        <th className="pb-2 font-semibold">Operation</th>
                        <th className="pb-2 font-semibold">Chatbot</th>
                        <th className="pb-2 font-semibold">Model</th>
                        <th className="pb-2 text-right font-semibold">In</th>
                        <th className="pb-2 text-right font-semibold">Cache r/w</th>
                        <th className="pb-2 text-right font-semibold">Out</th>
                        <th className="pb-2 text-right font-semibold">Latency</th>
                        <th className="pb-2 text-right font-semibold">Cost</th>
                        <th className="pb-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {d.recent.map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="py-1.5 whitespace-nowrap text-muted-foreground">{new Date(r.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                          <td className="py-1.5">{opLabel(r.operation)}</td>
                          <td className="py-1.5">{r.agent?.name ?? "—"}</td>
                          <td className="py-1.5 text-muted-foreground">{r.model}</td>
                          <td className="py-1.5 text-right tabular-nums">{full.format(r.inputTokens)}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                            {full.format(r.cacheReadTokens)} / {full.format(r.cacheWriteTokens)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{full.format(r.outputTokens)}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted-foreground">{r.latencyMs != null ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}</td>
                          <td className="py-1.5 text-right tabular-nums">{usd(r.costUsd)}</td>
                          <td className="py-1.5 pl-2">
                            {r.visitorId ? (
                              <Link to="/conversations" search={{ visitorId: r.visitorId }} className="text-primary hover:underline" title="Open conversation">
                                <ExternalLink className="size-3.5" />
                              </Link>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="p-4">
              <p className="mb-2 text-sm font-semibold">Price table used for the estimates</p>
              <p className="mb-3 text-[11px] text-muted-foreground">
                USD per million tokens. Cache writes cost 1.25× input, cache reads 0.1× — which is why a trained chatbot with a warm cache is cheap per reply. Edit
                the backend&apos;s <code>ai-pricing.ts</code> when Anthropic changes a rate; history re-prices itself.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="pb-2 font-semibold">Model</th>
                      <th className="pb-2 text-right font-semibold">Input</th>
                      <th className="pb-2 text-right font-semibold">Output</th>
                      <th className="pb-2 text-right font-semibold">Cache write</th>
                      <th className="pb-2 text-right font-semibold">Cache read</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.pricing.map((p) => (
                      <tr key={p.model} className="border-t border-border">
                        <td className="py-1.5 font-medium">{p.model}</td>
                        <td className="py-1.5 text-right tabular-nums">${p.inputPerMTok}</td>
                        <td className="py-1.5 text-right tabular-nums">${p.outputPerMTok}</td>
                        <td className="py-1.5 text-right tabular-nums">${p.cacheWritePerMTok}</td>
                        <td className="py-1.5 text-right tabular-nums">${p.cacheReadPerMTok}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

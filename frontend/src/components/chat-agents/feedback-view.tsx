/**
 * The admin's view of the thumbs: where likes and dislikes cluster — by
 * chatbot, reason, day, hour, model and tester — and the replies themselves,
 * each with the question that prompted it and a jump into the conversation.
 */

import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bot, ExternalLink, MessageSquareText, Phone, Quote, Star, ThumbsDown, ThumbsUp, User } from "lucide-react";

import { useGetChatAgents } from "@/components/chat-agents/hook/query/use-get-chat-agents";
import { useGetFeedbackPatterns } from "@/components/chat-agents/hook/query/use-get-feedback-patterns";
import { HBars, StackedBars } from "@/components/charts/bars";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui-kit";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/axios-config";
import { reasonLabel } from "@/lib/feedback-reasons";
import { textOnly } from "@/lib/widget-ui";
import { cn } from "@/lib/utils";
import type { FeedbackItem } from "@/types/chat-agent-types";

const LIKE = "var(--color-success)";
const DISLIKE = "var(--color-danger)";
const RANGES = [7, 30, 90] as const;

const pct = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const dayLabel = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString([], { day: "numeric", month: "short", timeZone: "UTC" });

function Section({ title, hint, children, className }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("p-4", className)}>
      <div className="mb-3">
        <p className="text-sm font-semibold">{title}</p>
        {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </Card>
  );
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const [open, setOpen] = useState(false);
  const up = item.rating === "up";
  return (
    <li className="rounded-xl border border-border bg-card p-3.5 shadow-elev-1">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {item.rating ? (
          <Badge tone={up ? "success" : "danger"}>
            {up ? <ThumbsUp className="size-3" /> : <ThumbsDown className="size-3" />}
            {up ? "Liked" : "Disliked"}
            {item.reason ? ` · ${reasonLabel(item.reason)}` : ""}
          </Badge>
        ) : (
          <Badge tone="info">
            <MessageSquareText className="size-3" /> Note
          </Badge>
        )}
        <Badge tone="muted">
          <Bot className="size-3" /> {item.agent.name}
        </Badge>
        <Badge tone="muted">
          <User className="size-3" /> {item.user?.name ?? item.visitorName ?? `Visitor ${item.visitorId.slice(0, 8)}`}
        </Badge>
        {item.conversationStars ? (
          <Badge tone="gold">
            <Star className="size-3 fill-current" /> {item.conversationStars}/5 chat
          </Badge>
        ) : null}
        <span className="ml-auto text-muted-foreground">{when(item.ratedAt ?? item.createdAt)}</span>
      </div>

      {item.question ? (
        <p className="mt-2.5 flex gap-1.5 text-[13px] text-muted-foreground">
          <Quote className="mt-0.5 size-3.5 shrink-0" />
          <span className="italic">{item.question}</span>
        </p>
      ) : null}

      <p className={cn("mt-2 whitespace-pre-wrap text-[13px] leading-relaxed", !open && "line-clamp-4")}>{textOnly(item.reply)}</p>
      {item.reply.length > 320 ? (
        <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-[11px] font-medium text-primary hover:underline">
          {open ? "Show less" : "Show full reply"}
        </button>
      ) : null}

      {item.note ? (
        <p className="mt-2.5 rounded-lg bg-muted px-3 py-2 text-[12.5px]">
          <span className="font-semibold">Their note:</span> {item.note}
        </p>
      ) : null}

      <div className="mt-2.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{item.model ?? ""}</span>
        <Link
          to="/conversations"
          search={{ visitorId: item.visitorId }}
          className="flex items-center gap-1 font-medium text-primary hover:underline"
        >
          Open conversation <ExternalLink className="size-3" />
        </Link>
      </div>
    </li>
  );
}

export function FeedbackView() {
  const { data: agents = [] } = useGetChatAgents();
  const [agentId, setAgentId] = useState("all");
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const [tab, setTab] = useState<"liked" | "disliked" | "notes">("liked");

  const query = useGetFeedbackPatterns({ agentId: agentId === "all" ? undefined : agentId, days });
  const d = query.data;
  const t = d?.totals;

  const list = d ? d[tab] : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title="Feedback"
        subtitle="What testers liked and disliked, and where it clusters."
        onRefresh={() => query.refetch()}
        actions={
          <>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs"
            >
              <option value="all">All chatbots</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div className="flex overflow-hidden rounded-md border border-border text-xs">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDays(r)}
                  className={cn("px-2.5 py-1.5", days === r ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
                >
                  {r}d
                </button>
              ))}
            </div>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-4">
        {query.isError ? (
          <ErrorState title="Couldn't load feedback" description={getErrorMessage(query.error, "Please try again.")} onRetry={() => void query.refetch()} />
        ) : !d || !t ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <StatCard label="Likes" value={String(t.likes)} accent="success" icon={<ThumbsUp className="size-4" />} hint={`last ${days} days`} />
              <StatCard label="Dislikes" value={String(t.dislikes)} accent="danger" icon={<ThumbsDown className="size-4" />} hint={`${t.notes} note${t.notes === 1 ? "" : "s"} left`} />
              <StatCard label="Like rate" value={pct(t.likeRate)} accent="primary" hint="likes ÷ (likes + dislikes)" />
              <StatCard label="Replies rated" value={pct(t.ratedShare)} accent="info" hint={`${t.likes + t.dislikes} of ${t.replies} replies got a thumb`} />
              <StatCard
                label="Avg chat rating"
                value={t.averageStars ? `${t.averageStars.toFixed(1)} / 5` : "—"}
                accent="gold"
                icon={<Star className="size-4" />}
                hint={`${t.conversationsRated} conversation${t.conversationsRated === 1 ? "" : "s"} rated`}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Section title="Likes and dislikes by day" className="xl:col-span-2">
                <StackedBars
                  data={d.byDay.map((r) => ({ label: dayLabel(r.date), title: r.date, values: { likes: r.likes, dislikes: r.dislikes } }))}
                  series={[
                    { key: "likes", label: "Likes", color: LIKE },
                    { key: "dislikes", label: "Dislikes", color: DISLIKE },
                  ]}
                />
              </Section>
              <Section title="By hour of day" hint="India time — when testers react">
                <StackedBars
                  height={120}
                  data={d.byHour.map((r) => ({ label: `${r.hour}`, title: `${r.hour}:00–${r.hour}:59 IST`, values: { likes: r.likes, dislikes: r.dislikes } }))}
                  series={[
                    { key: "likes", label: "Likes", color: LIKE },
                    { key: "dislikes", label: "Dislikes", color: DISLIKE },
                  ]}
                />
              </Section>
            </div>

            <Section
              title="Lead capture by chatbot"
              hint="Of the conversations started in this range: how many gave a name, how many a mobile number, and how many visitor messages it took. Likes tagged “convinced me”, “asked naturally” or “good offer” count as convincing; dislikes tagged “pushy”, “too early” or “scripted” count against."
            >
              {d.leads.length === 0 ? (
                <p className="py-3 text-xs text-muted-foreground">No conversations in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="pb-2 font-semibold">Chatbot</th>
                        <th className="pb-2 text-right font-semibold">Chats</th>
                        <th className="pb-2 text-right font-semibold">Names</th>
                        <th className="pb-2 text-right font-semibold">Numbers</th>
                        <th className="w-44 pb-2 font-semibold">Capture rate</th>
                        <th className="pb-2 text-right font-semibold">Msgs to number</th>
                        <th className="pb-2 text-right font-semibold">Convincing</th>
                        <th className="pb-2 text-right font-semibold">Pushy</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.leads.map((row) => (
                        <tr key={row.agent.id} className="border-t border-border">
                          <td className="py-2 font-medium">
                            {row.agent.name}
                            {row.agent.status !== "active" ? <span className="ml-1.5 text-[10px] text-muted-foreground">({row.agent.status})</span> : null}
                          </td>
                          <td className="py-2 text-right tabular-nums">{row.conversations}</td>
                          <td className="py-2 text-right tabular-nums">{row.withName}</td>
                          <td className="py-2 text-right tabular-nums font-semibold">
                            <span className="inline-flex items-center gap-1">
                              <Phone className="size-3 text-success" /> {row.withPhone}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-success" style={{ width: `${(row.captureRate ?? 0) * 100}%` }} />
                              </div>
                              <span className="w-9 text-right tabular-nums">{pct(row.captureRate)}</span>
                            </div>
                          </td>
                          <td className="py-2 text-right tabular-nums">{row.avgTurnsToPhone ?? "—"}</td>
                          <td className="py-2 text-right tabular-nums text-success">{row.convincingLikes}</td>
                          <td className="py-2 text-right tabular-nums text-danger">{row.pushyDislikes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <div className="grid gap-4 xl:grid-cols-3">
              <Section title="By chatbot" className="xl:col-span-2">
                {d.byAgent.length === 0 ? (
                  <p className="py-3 text-xs text-muted-foreground">No feedback in this range.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-[10.5px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="pb-2 font-semibold">Chatbot</th>
                          <th className="pb-2 text-right font-semibold">Likes</th>
                          <th className="pb-2 text-right font-semibold">Dislikes</th>
                          <th className="w-40 pb-2 font-semibold">Like rate</th>
                          <th className="pb-2 text-right font-semibold">Replies</th>
                          <th className="pb-2 text-right font-semibold">Rated</th>
                          <th className="pb-2 text-right font-semibold">Stars</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.byAgent.map((row) => (
                          <tr key={row.agent.id} className="border-t border-border">
                            <td className="py-2 font-medium">
                              {row.agent.name}
                              {row.agent.status !== "active" ? <span className="ml-1.5 text-[10px] text-muted-foreground">({row.agent.status})</span> : null}
                            </td>
                            <td className="py-2 text-right tabular-nums text-success">{row.likes}</td>
                            <td className="py-2 text-right tabular-nums text-danger">{row.dislikes}</td>
                            <td className="py-2 pr-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-danger/25">
                                  <div className="h-full rounded-full bg-success" style={{ width: `${(row.likeRate ?? 0) * 100}%` }} />
                                </div>
                                <span className="w-9 text-right tabular-nums">{pct(row.likeRate)}</span>
                              </div>
                            </td>
                            <td className="py-2 text-right tabular-nums">{row.replies}</td>
                            <td className="py-2 text-right tabular-nums text-muted-foreground">{pct(row.ratedShare)}</td>
                            <td className="py-2 text-right tabular-nums">{row.averageStars ? `${row.averageStars.toFixed(1)} (${row.starRatings})` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Section>
              <Section title="Why" hint="Reasons picked from the ⋯ menu">
                <p className="mb-1.5 text-[11px] font-semibold text-success">Liked because…</p>
                <HBars rows={d.byReason.up.filter((r) => r.count).map((r) => ({ label: reasonLabel(r.reason), value: r.count }))} color={LIKE} emptyLabel="No reason picked yet" />
                <p className="mt-4 mb-1.5 text-[11px] font-semibold text-danger">Disliked because…</p>
                <HBars rows={d.byReason.down.filter((r) => r.count).map((r) => ({ label: reasonLabel(r.reason), value: r.count }))} color={DISLIKE} emptyLabel="No reason picked yet" />
              </Section>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Section title="Liked replies were about" hint="Most common words in the questions">
                <Terms terms={d.themes.liked} tone="success" />
              </Section>
              <Section title="Disliked replies were about" hint="Most common words in the questions">
                <Terms terms={d.themes.disliked} tone="danger" />
              </Section>
              <Section title="Testers" hint="Who is giving the most feedback">
                <HBars
                  rows={d.byUser.map((u) => ({ label: u.label, value: u.likes + u.dislikes + u.notes, hint: `${u.likes}↑ ${u.dislikes}↓` }))}
                  emptyLabel="Nobody has reacted yet"
                />
              </Section>
              <Section title="By model">
                <HBars
                  rows={d.byModel.map((m) => ({ label: m.model, value: m.likes + m.dislikes, hint: `${pct(m.likeRate)} liked` }))}
                  emptyLabel="No feedback in this range"
                />
              </Section>
            </div>

            <Card className="p-0">
              <div className="flex items-center gap-1 border-b border-border px-2 pt-2">
                {(
                  [
                    ["liked", `Liked replies (${d.liked.length})`],
                    ["disliked", `Disliked replies (${d.disliked.length})`],
                    ["notes", `Notes (${d.notes.length})`],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    className={cn(
                      "-mb-px border-b-2 px-3 pb-2 text-xs font-medium",
                      tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {list.length === 0 ? (
                <p className="px-4 py-8 text-center text-xs text-muted-foreground">
                  Nothing here yet. Testers use the ⋯ under a reply to like it, dislike it or leave a note.
                </p>
              ) : (
                <ul className="grid gap-3 p-3 lg:grid-cols-2">
                  {list.map((item) => (
                    <FeedbackCard key={item.messageId} item={item} />
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function Terms({ terms, tone }: { terms: { term: string; count: number }[]; tone: "success" | "danger" }) {
  if (!terms.length) return <p className="py-3 text-xs text-muted-foreground">Not enough questions yet</p>;
  const max = terms[0]?.count ?? 1;
  return (
    <div className="flex flex-wrap gap-1.5">
      {terms.map((t) => (
        <span
          key={t.term}
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-medium",
            tone === "success" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
          )}
          style={{ fontSize: `${11 + (t.count / max) * 4}px` }}
          title={`${t.count} question${t.count === 1 ? "" : "s"}`}
        >
          {t.term} <span className="opacity-60">{t.count}</span>
        </span>
      ))}
    </div>
  );
}

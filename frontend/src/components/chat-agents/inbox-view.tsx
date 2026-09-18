import { useState, type ReactNode } from "react";
import {
  Bot,
  ChevronDown,
  Clock,
  Download,
  Flag,
  GraduationCap,
  Inbox as InboxIcon,
  Languages,
  Mail,
  MapPin,
  MessagesSquare,
  MessageSquareText,
  Monitor,
  Phone,
  Star,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  UserCheck,
  Wand2,
  Wifi,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";

import { useGetChatAgents } from "@/components/chat-agents/hook/query/use-get-chat-agents";
import {
  downloadInboxExport,
  useDeleteThread,
  useGetInboxStats,
  useGetInboxThread,
  useGetInboxThreads,
  useReviewThread,
  visitorLabel,
} from "@/components/chat-agents/hook/query/use-get-widget-inbox";
import { Badge, StatCard } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getErrorMessage } from "@/lib/axios-config";
import { INBOX_EXTRACTED_FIELDS } from "@/lib/chat-agent-constants";
import { capitalizeWords, cn, getReadableDate, getRelativeTime } from "@/lib/utils";
import type {
  InboxCollected,
  InboxExtracted,
  InboxMessage,
  InboxReviewStatus,
  InboxThread,
  InboxThreadDetail,
} from "@/types/chat-agent-types";

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

const REVIEW_TONES: Record<InboxReviewStatus, "muted" | "success-light" | "danger-light"> = {
  pending: "muted",
  reviewed: "success-light",
  flagged: "danger-light",
};

/** Who was chatting — the tester's account name, a captured name, or the visitor id. */
function threadName(item: Pick<InboxThread, "user" | "name" | "visitorId">) {
  return item.user?.name?.trim() || item.name?.trim() || visitorLabel(item.visitorId);
}

/**
 * Every recorded conversation, with the feedback left on it, plus an admin's
 * own review verdict. Three panes: list · transcript · details.
 */
export function InboxView() {
  const { data: agents = [] } = useGetChatAgents();
  const [agentId, setAgentId] = useState("all");
  const [reviewStatus, setReviewStatus] = useState<"all" | InboxReviewStatus>("all");
  const [withFeedbackOnly, setWithFeedbackOnly] = useState(false);
  const [withMessagesOnly, setWithMessagesOnly] = useState(true);
  const [visitorId, setVisitorId] = useState("");
  const [showStats, setShowStats] = useState(true);

  const filters = {
    agentId: agentId === "all" ? undefined : agentId,
    reviewStatus: reviewStatus === "all" ? undefined : reviewStatus,
    withFeedbackOnly,
    withMessagesOnly,
  };
  const threadsQuery = useGetInboxThreads(filters);
  const threads = threadsQuery.data?.threads ?? [];
  const statsQuery = useGetInboxStats(filters.agentId);

  const activeId = threads.some((t) => t.visitorId === visitorId) ? visitorId : (threads[0]?.visitorId ?? "");
  const threadQuery = useGetInboxThread(activeId || undefined);
  const thread = threadQuery.data;
  const deleteThread = useDeleteThread();

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Headline numbers */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Conversations</p>
            <p className="text-xs text-muted-foreground">Every chat is recorded. Rate, review and export them here.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowStats((v) => !v)}>
              {showStats ? "Hide numbers" : "Show numbers"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadInboxExport(filters.agentId).catch((err) => toast.error(getErrorMessage(err, "Export failed")))
              }
            >
              <Download className="size-3.5" /> Export JSON
            </Button>
          </div>
        </div>
        {showStats && statsQuery.data ? (
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            <StatCard label="Conversations" value={String(statsQuery.data.conversations)} hint={`${statsQuery.data.withMessages} with messages`} icon={<MessagesSquare className="size-4" />} />
            <StatCard
              label="Average rating"
              value={statsQuery.data.averageRating ? `${statsQuery.data.averageRating.toFixed(1)} / 5` : "—"}
              hint={`${statsQuery.data.rated} rated`}
              accent="gold"
              icon={<Star className="size-4" />}
            />
            <StatCard label="Thumbs up" value={String(statsQuery.data.thumbsUp)} accent="success" icon={<ThumbsUp className="size-4" />} />
            <StatCard label="Thumbs down" value={String(statsQuery.data.thumbsDown)} accent="danger" icon={<ThumbsDown className="size-4" />} />
            <StatCard label="Pending review" value={String(statsQuery.data.reviewStatus.pending ?? 0)} accent="warning" icon={<Clock className="size-4" />} />
            <StatCard label="Flagged" value={String(statsQuery.data.reviewStatus.flagged ?? 0)} accent="danger" icon={<Flag className="size-4" />} />
          </div>
        ) : null}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)_280px]">
        {/* Thread list */}
        <aside className="flex min-h-0 flex-col border-b border-border lg:border-r lg:border-b-0">
          <div className="space-y-2 border-b border-border px-3 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-xs font-semibold tracking-tight">Filter</p>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {threadsQuery.isLoading ? "…" : `${threads.length} shown`}
              </span>
            </div>
            <Select
              value={agentId}
              onValueChange={(value) => {
                setAgentId(value);
                setVisitorId("");
              }}
            >
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue placeholder="All chatbots" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All chatbots</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name || "Untitled chatbot"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={reviewStatus} onValueChange={(v) => setReviewStatus(v as typeof reviewStatus)}>
              <SelectTrigger className="h-7 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any review status</SelectItem>
                <SelectItem value="pending">Pending review</SelectItem>
                <SelectItem value="reviewed">Reviewed</SelectItem>
                <SelectItem value="flagged">Flagged</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              With feedback only
              <Switch checked={withFeedbackOnly} onCheckedChange={setWithFeedbackOnly} className="scale-90" />
            </label>
            <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
              Hide empty conversations
              <Switch checked={withMessagesOnly} onCheckedChange={setWithMessagesOnly} className="scale-90" />
            </label>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto max-lg:max-h-72">
            {threadsQuery.isLoading ? (
              <div className="space-y-2 p-3">
                {[0, 1, 2, 3].map((index) => (
                  <Skeleton key={index} className="h-14 rounded-lg" />
                ))}
              </div>
            ) : threadsQuery.isError ? (
              <p className="p-4 text-xs text-muted-foreground">{getErrorMessage(threadsQuery.error, "Could not load conversations")}</p>
            ) : (
              <ul>
                {threads.map((item) => (
                  <li key={item.visitorId}>
                    <button
                      type="button"
                      onClick={() => setVisitorId(item.visitorId)}
                      className={cn(
                        "flex w-full gap-2.5 border-b border-border px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                        item.visitorId === activeId && "bg-muted",
                      )}
                    >
                      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                        {initials(threadName(item))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-medium">{threadName(item)}</p>
                          <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">{getRelativeTime(item.lastSeenAt)}</span>
                        </div>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {item.lastMessage
                            ? `${item.lastMessage.role === "assistant" ? "Bot: " : ""}${item.lastMessage.preview}`
                            : "Opened the chat, never typed"}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                          <span className="truncate">{item.agent.name}</span>
                          <span>· {item.messageCount} msg</span>
                          {item.rating ? (
                            <span className="inline-flex items-center gap-0.5 text-gold">
                              <Star className="size-2.5 fill-current" /> {item.rating}
                            </span>
                          ) : null}
                          {item.thumbs.up ? (
                            <span className="inline-flex items-center gap-0.5 text-success">
                              <ThumbsUp className="size-2.5" /> {item.thumbs.up}
                            </span>
                          ) : null}
                          {item.thumbs.down ? (
                            <span className="inline-flex items-center gap-0.5 text-danger">
                              <ThumbsDown className="size-2.5" /> {item.thumbs.down}
                            </span>
                          ) : null}
                          {item.reviewStatus !== "pending" ? (
                            <Badge tone={REVIEW_TONES[item.reviewStatus]} className="px-1.5 py-0 text-[9px]">
                              {item.reviewStatus}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
                {!threads.length ? <li className="p-4 text-xs text-muted-foreground">No conversations match these filters.</li> : null}
              </ul>
            )}
          </div>
        </aside>

        {/* Transcript */}
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 xl:border-r">
          <div className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{thread ? threadName({ visitorId: thread.visitor.id, user: thread.visitor.user, name: thread.collected.name }) : "No conversations yet"}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                {thread ? `${thread.agent.name} · first seen ${getReadableDate(thread.visitor.firstSeenAt)}` : "Pick a conversation on the left"}
              </p>
            </div>
            {thread ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-danger hover:text-danger"
                title="Delete this conversation"
                onClick={() => {
                  if (window.confirm("Delete this conversation and its messages? This cannot be undone.")) {
                    deleteThread.mutate(thread.visitor.id, { onSuccess: () => setVisitorId("") });
                  }
                }}
              >
                <Trash2 className="size-3.5" />
              </Button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {threadsQuery.isError ? (
              <ErrorState
                title="Couldn't load conversations"
                description={getErrorMessage(threadsQuery.error, "Please try again.")}
                className="border-none bg-transparent shadow-none"
                onRetry={() => void threadsQuery.refetch()}
                isRetrying={threadsQuery.isFetching}
              />
            ) : threadsQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-14 rounded-2xl" />
                ))}
              </div>
            ) : !threads.length ? (
              <EmptyPane icon={InboxIcon} title="No conversations yet" body="Share a chatbot link or start a chat from the gallery — every conversation lands here." />
            ) : threadQuery.isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((index) => (
                  <Skeleton key={index} className="h-14 rounded-2xl" />
                ))}
              </div>
            ) : !thread?.messages.length ? (
              <EmptyPane icon={MessagesSquare} title="This visitor never typed" body="They opened the chat and closed it without asking anything." />
            ) : (
              thread.messages.map((message) => <TranscriptBubble key={message.id} message={message} />)
            )}
          </div>

          {thread?.feedback.rating ? (
            <div className="flex items-start gap-3 border-t border-border bg-gold/5 px-4 py-3">
              <div className="flex shrink-0 items-center gap-0.5 text-gold">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star key={n} className={cn("size-3.5", n <= (thread.feedback.rating ?? 0) ? "fill-current" : "opacity-30")} />
                ))}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium">Rated {thread.feedback.rating}/5 by the person chatting</p>
                {thread.feedback.ratingComment ? (
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">“{thread.feedback.ratingComment}”</p>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="border-t border-border px-4 py-2 text-center text-[11px] text-muted-foreground">
              Read-only transcript. The person chatting has not rated this conversation yet.
            </p>
          )}
        </section>

        <ThreadDetails thread={thread} />
      </div>
    </div>
  );
}

function TranscriptBubble({ message }: { message: InboxMessage }) {
  const assistant = message.role === "assistant";
  return (
    <div className={cn("flex", assistant ? "justify-start" : "justify-end")}>
      <div className="max-w-[85%] sm:max-w-[75%]">
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap",
            assistant ? "rounded-bl-sm bg-muted" : "rounded-br-sm bg-primary text-primary-foreground",
          )}
        >
          {message.content}
          {assistant ? (
            <MessageMeta message={message} />
          ) : (
            <span className="mt-1 block text-[10px] opacity-70">{clock(message.createdAt)}</span>
          )}
        </div>
        {assistant && (message.rating || message.feedbackNote) ? (
          <div
            className={cn(
              "mt-1 flex items-start gap-1.5 rounded-lg px-2 py-1 text-[11px]",
              message.rating === "down" ? "bg-danger/10 text-danger" : "bg-success/10 text-success",
            )}
          >
            {message.rating === "down" ? <ThumbsDown className="mt-0.5 size-3 shrink-0" /> : <ThumbsUp className="mt-0.5 size-3 shrink-0" />}
            <span className="min-w-0">
              {message.rating === "down" ? "Marked as a bad reply" : message.rating === "up" ? "Marked as a good reply" : "Note left"}
              {message.feedbackNote ? <span className="block whitespace-pre-wrap text-foreground/80">“{message.feedbackNote}”</span> : null}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function MessageMeta({ message }: { message: InboxMessage }) {
  if (message.inputTokens === null) {
    return (
      <span className="mt-1 block text-[10px] opacity-70">
        {clock(message.createdAt)}
        {message.chipNodeId ? ` · chip: ${message.chipNodeId}` : ""}
      </span>
    );
  }
  return (
    <span className="mt-1 block text-[10px] text-muted-foreground">
      {clock(message.createdAt)} · {message.inputTokens} in / {message.outputTokens} out
      {message.cacheReadTokens ? ` · ${message.cacheReadTokens} cached` : ""}
      {message.latencyMs ? ` · ${(message.latencyMs / 1000).toFixed(1)}s` : ""}
      {message.packVersion ? ` · pack v${message.packVersion}` : ""}
    </span>
  );
}

function EmptyPane({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="grid h-full place-items-center text-center">
      <div className="max-w-sm space-y-2">
        <Icon className="mx-auto size-7 text-muted-foreground" />
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

/* ── Details pane ─────────────────────────────────────────────────────────── */

const CONTACT_FIELDS: { key: keyof InboxCollected; label: string; icon: LucideIcon }[] = [
  { key: "name", label: "Name", icon: User },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "email", label: "Email", icon: Mail },
  { key: "location", label: "Location", icon: MapPin },
  { key: "courseInterest", label: "Interest", icon: GraduationCap },
];

function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function displayUrl(raw: string) {
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname}${url.search}`.replace(/\/$/, "") || url.host;
  } catch {
    return raw;
  }
}

function displayIp(ip: string | null) {
  if (!ip) return null;
  return ip === "::1" || ip === "127.0.0.1" ? "Local" : ip;
}

function extractedRows(custom: InboxExtracted | null | undefined): { label: string; value: string }[] {
  if (!custom) return [];
  const rows: { label: string; value: string }[] = [];
  const known = new Set<string>();
  for (const field of INBOX_EXTRACTED_FIELDS) {
    if (field.key === "location") {
      const location = [custom.city, custom.state, custom.country]
        .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
        .join(", ");
      if (location) rows.push({ label: field.label, value: location });
      known.add("city");
      known.add("state");
      known.add("country");
      continue;
    }
    known.add(field.key);
    const raw = custom[field.key];
    if (raw === null || raw === undefined || raw === "") continue;
    if (field.kind === "boolean") rows.push({ label: field.label, value: raw ? "Yes" : "No" });
    else if (field.kind === "date") rows.push({ label: field.label, value: getReadableDate(String(raw)) || String(raw) });
    else {
      const text = String(raw);
      rows.push({ label: field.label, value: /^[a-z_]+$/.test(text) ? capitalizeWords(text.replace(/_/g, " ")) : text });
    }
  }
  for (const [key, raw] of Object.entries(custom)) {
    if (known.has(key) || raw === null || raw === undefined || raw === "") continue;
    rows.push({ label: capitalizeWords(key.replace(/([A-Z])/g, " $1")), value: typeof raw === "boolean" ? (raw ? "Yes" : "No") : String(raw) });
  }
  return rows;
}

function ExtractedDetails({ custom }: { custom: InboxExtracted | null | undefined }) {
  const [open, setOpen] = useState(true);
  const rows = extractedRows(custom);
  if (rows.length === 0) return null;
  return (
    <section className="border-b border-border px-3 py-3 last:border-b-0">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="mb-2 flex w-full items-center gap-1.5 text-left">
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">Learned during the chat</h2>
        <span className="ml-auto flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          {rows.length}
          <ChevronDown className={cn("size-3.5 transition-transform", open ? "rotate-0" : "-rotate-90")} />
        </span>
      </button>
      {open ? (
        <ul className="space-y-2.5">
          {rows.map(({ label, value }) => (
            <li key={label} className="flex items-start gap-2.5">
              <Wand2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="truncate text-xs" title={value}>
                  {value}
                </p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function FlowStateBadge({ visitor }: { visitor: InboxThreadDetail["visitor"] }) {
  if (visitor.handoffAt) {
    return <Hint label={<Badge tone="danger-light">Asked for a person at {clock(visitor.handoffAt)}</Badge>} text="Pressed the “talk to a person” chip." />;
  }
  if (visitor.guidedFlowExitedAt) {
    return <Hint label={<Badge tone="warning-light">Switched to free chat</Badge>} text="Left the chip menu for the AI. Everything after that point is the model answering." />;
  }
  if (visitor.currentNodeId) {
    return <Hint label={<Badge tone="muted">In guided flow</Badge>} text={`Last chip: ${visitor.currentNodeId}. These turns cost no model tokens.`} />;
  }
  return null;
}

function ReviewPanel({ thread }: { thread: InboxThreadDetail }) {
  const review = useReviewThread(thread.visitor.id);
  const [note, setNote] = useState(thread.review.note ?? "");
  const [editingFor, setEditingFor] = useState(thread.visitor.id);
  if (editingFor !== thread.visitor.id) {
    setEditingFor(thread.visitor.id);
    setNote(thread.review.note ?? "");
  }

  const setStatus = (reviewStatus: InboxReviewStatus) =>
    review.mutate({ reviewStatus, reviewNote: note.trim() || null }, { onSuccess: () => toast.success(`Marked ${reviewStatus}`) });

  return (
    <DetailSection title="Your review" hint="Only admins see this. Use it to record what you thought of the conversation.">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={REVIEW_TONES[thread.review.status]}>{thread.review.status}</Badge>
        {thread.review.reviewedBy ? (
          <span className="text-[10px] text-muted-foreground">
            by {thread.review.reviewedBy.name}
            {thread.review.reviewedAt ? ` · ${getRelativeTime(thread.review.reviewedAt)}` : ""}
          </span>
        ) : null}
      </div>
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={3}
        placeholder="Notes for the team — what worked, what to fix…"
        className="mt-2 text-xs"
      />
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <Button size="sm" variant={thread.review.status === "reviewed" ? "default" : "outline"} disabled={review.isPending} onClick={() => setStatus("reviewed")}>
          <UserCheck className="size-3.5" /> Reviewed
        </Button>
        <Button size="sm" variant={thread.review.status === "flagged" ? "destructive" : "outline"} disabled={review.isPending} onClick={() => setStatus("flagged")}>
          <Flag className="size-3.5" /> Flag
        </Button>
        <Button size="sm" variant="outline" disabled={review.isPending} onClick={() => setStatus("pending")}>
          Reset
        </Button>
      </div>
    </DetailSection>
  );
}

function ThreadDetails({ thread }: { thread: InboxThreadDetail | undefined }) {
  if (!thread) {
    return (
      <aside className="hidden min-h-0 flex-col xl:flex">
        <div className="grid flex-1 place-items-center px-6 text-center">
          <p className="text-xs text-muted-foreground">Select a conversation to see who was chatting and leave a review.</p>
        </div>
      </aside>
    );
  }

  const { visitor, collected, context, usage, messages, agent } = thread;
  const displayName = threadName({ visitorId: visitor.id, user: visitor.user, name: collected.name });
  const contactRows = CONTACT_FIELDS.filter((field) => collected[field.key]);
  const extracted = thread.custom ?? visitor.custom ?? null;

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="hidden min-h-0 overflow-y-auto xl:block">
        <div className="border-b border-border px-3 py-3">
          <div className="flex items-start gap-2.5">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
              {initials(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{displayName}</p>
              <p className="truncate text-[11px] text-muted-foreground">
                <Bot className="mr-1 inline size-3" />
                {agent.name}
                {agent.model ? ` · ${agent.model}` : ""}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {visitor.user ? (
                  <Hint label={<Badge tone="primary-light">Signed-in tester</Badge>} text={`${visitor.user.name} · ${visitor.user.email}`} />
                ) : (
                  <Hint label={<Badge tone="muted">Share link</Badge>} text="Came through a share link or an embed. One browser, not necessarily one person." />
                )}
                <FlowStateBadge visitor={visitor} />
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-1.5">
            <Stat label="First seen" value={getReadableDate(visitor.firstSeenAt) || "—"} />
            <Stat label="Active" value={getRelativeTime(visitor.lastSeenAt) || "—"} />
            <Stat label="Messages" value={String(messages.length)} />
          </div>
        </div>

        <ReviewPanel thread={thread} />

        <DetailSection title="Feedback">
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Rating" value={thread.feedback.rating ? `${thread.feedback.rating}/5` : "—"} />
            <Stat label="Good" value={String(usage.thumbsUp)} />
            <Stat label="Bad" value={String(usage.thumbsDown)} />
          </div>
          {thread.feedback.ratingComment ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <MessageSquareText className="mt-0.5 size-3 shrink-0" />
              <span className="whitespace-pre-wrap">{thread.feedback.ratingComment}</span>
            </p>
          ) : null}
        </DetailSection>

        <DetailSection title="Who">
          {contactRows.length || visitor.user ? (
            <ul className="space-y-2.5">
              {visitor.user ? (
                <li className="flex items-start gap-2.5">
                  <User className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">Account</p>
                    <p className="truncate text-xs">
                      {visitor.user.name} · {visitor.user.email}
                    </p>
                  </div>
                </li>
              ) : null}
              {contactRows.map(({ key, label, icon: Icon }) => (
                <li key={key} className="flex items-start gap-2.5">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">{label}</p>
                    <p className="truncate text-xs">{collected[key]}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">Anonymous — no name or contact details were given.</p>
          )}
        </DetailSection>

        <ExtractedDetails custom={extracted} />

        <DetailSection title="Session">
          <ul className="space-y-2">
            <ContextRow icon={Monitor} value={[context.browser, context.os].filter(Boolean).join(" · ") || context.deviceType} />
            <ContextRow icon={Clock} value={context.timezone} />
            <ContextRow icon={Languages} value={context.language} />
            <ContextRow icon={Wifi} value={displayIp(context.ipAddress)} />
          </ul>
          {context.pageUrl ? (
            <a href={context.pageUrl} target="_blank" rel="noreferrer" title={context.pageUrl} className="mt-2.5 block truncate text-[11px] text-primary hover:underline">
              {displayUrl(context.pageUrl)}
            </a>
          ) : null}
        </DetailSection>

        <DetailSection title="Tokens" hint="Cached tokens cost a fraction of input. If cache stays at zero across turns, prompt caching has stopped working.">
          <div className="grid grid-cols-3 gap-1.5">
            <Stat label="Input" value={usage.inputTokens.toLocaleString()} />
            <Stat label="Output" value={usage.outputTokens.toLocaleString()} />
            <Stat label="Cached" value={usage.cacheReadTokens.toLocaleString()} />
          </div>
        </DetailSection>
      </aside>
    </TooltipProvider>
  );
}

function DetailSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-b border-border px-3 py-3 last:border-b-0">
      <div className="mb-2 flex items-center gap-1.5">
        <h2 className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{title}</h2>
        {hint ? <Hint text={hint} /> : null}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted px-2 py-1.5">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-xs font-medium tabular-nums">{value}</p>
    </div>
  );
}

function ContextRow({ icon: Icon, value }: { icon: LucideIcon; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <li className="flex items-center gap-2.5 text-xs">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 truncate">{value}</span>
    </li>
  );
}

function Hint({ label, text }: { label?: ReactNode; text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center" aria-label="More info">
          {label ?? <span className="text-muted-foreground hover:text-foreground">ⓘ</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-56 text-xs leading-relaxed">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

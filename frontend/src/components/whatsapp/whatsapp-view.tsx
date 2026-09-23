/**
 * The WhatsApp channel (phase 2): a phone simulator that runs the real bot
 * pipeline without sending anything, the receipts analytics, and the people
 * the bot is talking to. Everything on screen is read back from the server, so
 * the ticks under a bubble are the stored delivery ladder, not local state.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, CheckCheck, Clock, List, MousePointerClick, RefreshCw, Send, SkipForward, UserPlus, X } from "lucide-react";

import { Badge, Card, PageHeader, StatCard } from "@/components/ui-kit";
import { FollowupRules } from "@/components/whatsapp/followup-rules";
import { ErrorState } from "@/components/ui/empty-state";
import Axios, { getErrorMessage } from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type WaOption = { id: string; title: string; description?: string };
type Outbound =
  | { kind: "text"; body: string }
  | { kind: "buttons"; body: string; options: WaOption[] }
  | { kind: "list"; body: string; button: string; options: WaOption[] }
  | { kind: "image"; url: string; caption?: string }
  | { kind: "template"; name: string; body: string; quickReplies?: string[] };

type Template = {
  name: string;
  language: string;
  category: string;
  body: string;
  bodyVariables: number;
  quickReplies: string[];
  usable: boolean;
};

type WaMessage = {
  id: string;
  direction: "in" | "out";
  kind: string;
  body: string | null;
  payload: unknown;
  source: string;
  provider: string;
  status: string;
  optionTitle: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  error: string | null;
  createdAt: string;
};

type ContactDetail = {
  id: string;
  waId: string;
  stage: string;
  score: number | null;
  scoreBand: string | null;
  scoreSignals: ScoreSignal[] | null;
  handoffReason: string | null;
  botPausedUntil: string | null;
  optedOutAt: string | null;
  nextFollowupAt: string | null;
  followupCount: number;
  visitor: { name: string | null; courseInterest: string | null; location: string | null; custom: Record<string, unknown> | null };
  messages: WaMessage[];
};

type Status = {
  checks: Record<string, boolean>;
  agent: { id: string; name: string } | null;
  interactiveMode: string;
  allowlist: string;
  callbackUrl: string | null;
  approvedTemplates: Array<{ name: string; language: string; category: string }>;
  templatesError: string | null;
};

const TABS = ["Simulator", "Follow-ups", "Analytics", "Contacts"] as const;
type Tab = (typeof TABS)[number];

const newWaId = () => `9100000${Math.floor(10000 + Math.random() * 89999)}`;
const STORAGE_KEY = "wa-sim-waid";

function readStoredWaId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || newWaId();
  } catch {
    return newWaId();
  }
}

export function WhatsappView() {
  const [tab, setTab] = useState<Tab>("Simulator");
  const status = useQuery({
    queryKey: [QUERY_KEYS.GET_WHATSAPP_STATUS],
    queryFn: async () => (await Axios.get<Status>("/api/v1/whatsapp/status")).data,
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-border px-4 pt-4 md:px-6">
        <PageHeader
          title="WhatsApp"
          subtitle="Tara, Acharya's assistant on its WhatsApp number (through Mcube): replies, follow-ups by lead stage, and analytics."
        />
        <StatusStrip status={status.data} />
        <div className="mt-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "rounded-t-lg px-3 py-2 text-sm font-medium",
                tab === t ? "bg-card text-foreground border border-b-0 border-border" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30 p-4 md:p-6">
        {tab === "Simulator" && <Simulator />}
        {tab === "Follow-ups" && <FollowupRules />}
        {tab === "Analytics" && <Analytics />}
        {tab === "Contacts" && <Contacts />}
      </div>
    </div>
  );
}

function StatusStrip({ status }: { status?: Status }) {
  if (!status) return null;
  const c = status.checks;
  const item = (ok: boolean, label: string) => (
    <Badge tone={ok ? "success-light" : "warning-light"}>
      {ok ? <Check className="size-3" /> : <X className="size-3" />} {label}
    </Badge>
  );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {item(c.mcubeConfigured && c.mcubeReachable, c.mcubeReachable ? "Mcube connected" : "Mcube not reachable")}
      {item(c.webhookSecret, c.webhookSecret ? "Webhook secured" : "Webhook secret not set")}
      {item(c.agentTrained, status.agent ? `Bot: ${status.agent.name}` : "No trained WhatsApp bot")}
      {item(c.botEnabled, c.botEnabled ? "Replies on" : "Replies off")}
      <Badge tone="muted">Options: {status.interactiveMode === "mcube" ? "WhatsApp buttons" : "numbered list"}</Badge>
      <Badge tone="muted">Live sends to: {status.allowlist}</Badge>
      <Badge tone="muted">{status.approvedTemplates.length} approved templates</Badge>
    </div>
  );
}

// ── Simulator ────────────────────────────────────────────────────────────────

function Simulator() {
  const qc = useQueryClient();
  const [simWaId, setSimWaId] = useState(readStoredWaId);
  const [live, setLive] = useState(false);
  const [phone, setPhone] = useState("91");
  const waId = live ? phone.replace(/\D/g, "") : simWaId;
  const [text, setText] = useState("");
  const [sheet, setSheet] = useState<{ button: string; options: WaOption[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, simWaId);
    } catch {
      /* private window: the thread just won't survive a reload */
    }
  }, [simWaId]);

  const thread = useQuery({
    queryKey: [QUERY_KEYS.GET_WHATSAPP_CONTACT, waId],
    enabled: /^\d{10,15}$/.test(waId),
    queryFn: async () => {
      try {
        return (await Axios.get<ContactDetail>(`/api/v1/whatsapp/contacts/${waId}`)).data;
      } catch (err) {
        if ((err as { status?: number }).status === 404) return null;
        throw err;
      }
    },
  });

  const refresh = () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_WHATSAPP_CONTACT, waId] });

  const send = useMutation({
    mutationFn: async (input: { text?: string; optionId?: string }) =>
      (await Axios.post("/api/v1/whatsapp/simulate", { waId, profileName: "Test Student", live, ...input })).data,
    onMutate: () => setError(null),
    onError: (err) => setError(getErrorMessage(err, "The bot could not answer.")),
    onSettled: refresh,
  });
  // A live thread's ticks come from Mcube's real receipts: poll for them.
  useEffect(() => {
    if (!live) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [live, waId]);
  const receipt = useMutation({
    mutationFn: async (input: { messageId: string; status: "delivered" | "read" }) =>
      (await Axios.post("/api/v1/whatsapp/simulate/status", input)).data,
    onSettled: refresh,
  });
  const followup = useMutation({
    mutationFn: async () => (await Axios.post(`/api/v1/whatsapp/simulate/followup/${waId}`)).data,
    onError: (err) => setError(getErrorMessage(err, "No follow-up to send.")),
    onSettled: refresh,
  });

  const templates = useQuery({
    queryKey: [QUERY_KEYS.GET_WHATSAPP_TEMPLATES],
    queryFn: async () => (await Axios.get<{ templates: Template[] }>("/api/v1/whatsapp/templates")).data.templates,
  });
  const [templateKey, setTemplateKey] = useState("start_chat:en_US");
  const [params, setParams] = useState<string[]>(["there"]);
  const template = templates.data?.find((t) => `${t.name}:${t.language}` === templateKey);
  const start = useMutation({
    mutationFn: async () =>
      (
        await Axios.post("/api/v1/whatsapp/contacts/start", {
          waId,
          live,
          template: template?.name,
          language: template?.language,
          params: params.slice(0, template?.bodyVariables ?? 0),
        })
      ).data,
    onMutate: () => setError(null),
    onError: (err) => setError(getErrorMessage(err, "The template was not sent.")),
    onSettled: refresh,
  });

  const messages = thread.data?.messages ?? [];
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, send.isPending]);

  const submit = () => {
    const value = text.trim();
    if (!value || send.isPending) return;
    setText("");
    send.mutate({ text: value });
  };
  const tap = (o: WaOption) => {
    setSheet(null);
    send.mutate(o.id ? { optionId: o.id, text: o.title } : { text: o.title });
  };

  const c = thread.data;
  const facts = (c?.visitor.custom ?? {}) as Record<string, unknown>;

  return (
    <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
      <div className="relative mx-auto flex h-[680px] w-full max-w-[400px] flex-col overflow-hidden rounded-[28px] border-8 border-foreground/85 bg-[#efeae2] shadow-elev-2">
        <div className="flex items-center justify-between bg-[#075e54] px-4 py-3 text-white">
          <div>
            <p className="text-sm font-semibold">Acharya Admissions</p>
            <p className="text-[11px] opacity-80">{send.isPending ? "typing…" : `you are +${waId}`}</p>
          </div>
          <button
            title="Start as a new person"
            onClick={() => {
              setSimWaId(newWaId());
              setLive(false);
              setSheet(null);
            }}
            className="rounded-full p-1.5 hover:bg-white/15"
          >
            <UserPlus className="size-4" />
          </button>
        </div>

        <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
          {!messages.length && !send.isPending && (
            <p className="mx-auto mt-10 max-w-[240px] rounded-lg bg-[#fff5c4] px-3 py-2 text-center text-xs text-[#54656f]">
              Send "Hi" the way a student would after seeing an ad or the website.
            </p>
          )}
          {messages.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              onTap={tap}
              onOpenList={setSheet}
              onReceipt={(s) => receipt.mutate({ messageId: m.id, status: s })}
              disabled={send.isPending}
            />
          ))}
          {send.isPending && <div className="w-16 rounded-lg bg-white px-3 py-2 text-xs text-[#667781] shadow-sm">…</div>}
        </div>

        {sheet && (
          <div className="absolute inset-0 z-10 flex items-end bg-black/30" onClick={() => setSheet(null)}>
            <div className="w-full rounded-t-2xl bg-white p-3" onClick={(e) => e.stopPropagation()}>
              <p className="mb-2 text-center text-sm font-semibold text-[#111b21]">{sheet.button}</p>
              {sheet.options.map((o) => (
                <button key={o.id} onClick={() => tap(o)} className="block w-full border-t border-[#e9edef] px-2 py-2.5 text-left">
                  <span className="block text-sm text-[#111b21]">{o.title}</span>
                  {o.description && <span className="block text-xs text-[#667781]">{o.description}</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {live ? (
          <p className="bg-[#f0f2f5] px-3 py-3 text-center text-xs text-[#54656f]">
            Live: reply from your phone. Replies and blue ticks show up here within a few seconds.
          </p>
        ) : (
        <div className="flex items-center gap-2 bg-[#f0f2f5] px-2 py-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="Message"
            className="min-w-0 flex-1 rounded-full bg-white px-4 py-2 text-sm text-[#111b21] outline-none"
          />
          <button onClick={submit} disabled={send.isPending} className="rounded-full bg-[#00a884] p-2.5 text-white disabled:opacity-50">
            <Send className="size-4" />
          </button>
        </div>
        )}
      </div>

      <div className="space-y-4">
        {error && <ErrorState title="Something went wrong" description={error} />}
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">This contact</h3>
            <button onClick={refresh} className="text-muted-foreground hover:text-foreground" title="Refresh">
              <RefreshCw className="size-4" />
            </button>
          </div>
          {c ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Fact label="Stage" value={c.stage} />
              <Fact label="Name" value={c.visitor.name} />
              <Fact label="Programme" value={c.visitor.courseInterest} />
              <Fact label="City" value={c.visitor.location} />
              <Fact label="Handoff" value={c.handoffReason} />
              <Fact label="Call slot" value={facts.preferredCallTime as string} />
              <Fact label="Bot paused until" value={c.botPausedUntil && new Date(c.botPausedUntil).toLocaleString()} />
              <Fact label="Opted out" value={c.optedOutAt && "yes"} />
              <Fact label="Follow-ups sent" value={String(c.followupCount)} />
              <Fact label="Next follow-up" value={c.nextFollowupAt && new Date(c.nextFollowupAt).toLocaleString()} />
            </dl>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No messages yet.</p>
          )}
          {c && c.score !== null ? (
            <div className="mt-4 border-t border-border pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">Likely to convert</span>
                <ScoreBadge score={c.score} band={c.scoreBand} />
              </div>
              <ul className="mt-2 space-y-1 text-xs">
                {(c.scoreSignals ?? []).map((sig, i) => (
                  <li key={`${sig.label}-${i}`} className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">{sig.label}</span>
                    <span className={sig.points < 0 ? "tabular-nums text-destructive" : "tabular-nums"}>
                      {sig.points > 0 ? `+${sig.points}` : sig.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
        <Card className={cn("p-4 text-sm", live && "border-[#00a884]")}>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
            Send the replies to a real phone
          </label>
          <p className="mt-1 text-muted-foreground">
            Start with a template below; it arrives on this WhatsApp through Mcube. Reply from the phone and the bot
            answers there. The number must be on WHATSAPP_ALLOWED_NUMBERS.
          </p>
          {live && (
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="919876543210"
              className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 tabular-nums"
            />
          )}
        </Card>
        <Card className="p-4 text-sm">
          <h3 className="font-semibold">Start the conversation with a template</h3>
          <p className="mt-1 text-muted-foreground">
            WhatsApp only allows an approved template until the person replies. Their tap on a quick reply opens the
            24 hour window, and from there the bot answers freely.
          </p>
          <select
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            {(templates.data ?? []).map((t) => (
              <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`} disabled={!t.usable}>
                {t.name} ({t.language}, {t.category.toLowerCase()}){t.usable ? "" : " · needs an image"}
              </option>
            ))}
          </select>
          {template && (
            <>
              <p className="mt-2 whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-xs">{template.body}</p>
              {Array.from({ length: template.bodyVariables }, (_, i) => (
                <input
                  key={i}
                  value={params[i] ?? ""}
                  onChange={(e) => setParams((prev) => Object.assign([...prev], { [i]: e.target.value }))}
                  placeholder={i === 0 ? "{{1}} usually the first name" : `{{${i + 1}}}`}
                  className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              ))}
              {template.quickReplies.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">Buttons: {template.quickReplies.join(" · ")}</p>
              )}
            </>
          )}
          <button
            onClick={() => start.mutate()}
            disabled={!template || start.isPending || !/^\d{10,15}$/.test(waId)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-[#00a884] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            <Send className="size-3.5" /> {start.isPending ? "Sending…" : live ? "Send to the phone" : "Send in the simulator"}
          </button>
        </Card>
        <StyleNotes />
        <Card className="p-4 text-sm">
          <h3 className="font-semibold">Try these</h3>
          <ul className="mt-2 space-y-1.5 text-muted-foreground">
            <li>"Hi", then tap who you are: admissions, a current student, or something else.</li>
            <li>As a student: "I paid my fee but got no receipt" goes to the student affairs office.</li>
            <li>"What is the fee for CSE?": always goes to a counsellor, never a figure.</li>
            <li>A course question, then tap a suggestion: the AI turn.</li>
            <li>Click the ticks under a bot message to mark it delivered, then read. Those receipts feed Analytics.</li>
            <li>"STOP" opts out; "START" opts back in.</li>
          </ul>
          <button
            onClick={() => followup.mutate()}
            disabled={!c || followup.isPending}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <SkipForward className="size-3.5" /> {followup.isPending ? "Writing follow-up…" : "Skip ahead: send the next follow-up"}
          </button>
        </Card>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined | false }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value || "—"}</dd>
    </div>
  );
}

/** WhatsApp formatting: *bold* and _italic_, line breaks kept. */
function WaText({ text }: { text: string }) {
  const parts = text.split(/(\*[^*\n]+\*|_[^_\n]+_)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        /^\*[^*]+\*$/.test(p) ? <strong key={i}>{p.slice(1, -1)}</strong> : /^_[^_]+_$/.test(p) ? <em key={i}>{p.slice(1, -1)}</em> : p,
      )}
    </span>
  );
}

function Bubble({
  m,
  onTap,
  onOpenList,
  onReceipt,
  disabled,
}: {
  m: WaMessage;
  onTap: (o: WaOption) => void;
  onOpenList: (s: { button: string; options: WaOption[] }) => void;
  onReceipt: (s: "delivered" | "read") => void;
  disabled: boolean;
}) {
  const time = new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (m.direction === "in") {
    return (
      <div className="ml-auto w-fit max-w-[80%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-2.5 py-1.5 text-sm text-[#111b21] shadow-sm">
        {m.optionTitle && <MousePointerClick className="mr-1 inline size-3 text-[#667781]" />}
        <WaText text={m.body ?? `[${m.kind}]`} />
        <span className="ml-2 align-bottom text-[10px] text-[#667781]">{time}</span>
      </div>
    );
  }

  const p = (m.payload ?? {}) as Outbound;
  const next = m.readAt ? null : m.deliveredAt ? "read" : "delivered";
  const ticks =
    m.status === "failed" ? (
      <X className="inline size-3.5 text-danger" />
    ) : m.readAt ? (
      <CheckCheck className="inline size-3.5 text-[#53bdeb]" />
    ) : m.deliveredAt ? (
      <CheckCheck className="inline size-3.5 text-[#667781]" />
    ) : m.sentAt ? (
      <Check className="inline size-3.5 text-[#667781]" />
    ) : (
      <Clock className="inline size-3 text-[#667781]" />
    );

  return (
    <div className="w-fit max-w-[85%]">
      <div className="rounded-lg rounded-tl-none bg-white px-2.5 py-1.5 text-sm text-[#111b21] shadow-sm">
        {p.kind === "template" && (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8696a0]">template · {p.name}</p>
        )}
        {m.source !== "bot" && p.kind !== "template" && (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#00a884]">{m.source}</p>
        )}
        {p.kind === "image" ? (
          <>
            <img src={p.url} alt={p.caption ?? ""} className="mb-1 max-h-48 w-full rounded object-cover" />
            {p.caption && <WaText text={p.caption} />}
          </>
        ) : (
          <WaText text={"body" in p && p.body ? p.body : (m.body ?? "")} />
        )}
        <span className="float-right ml-2 mt-1 text-[10px] text-[#667781]">
          {time}{" "}
          <button
            disabled={!next || m.status === "failed" || m.provider !== "simulator"}
            title={next ? `Simulate a "${next}" receipt` : "Read"}
            onClick={() => next && onReceipt(next)}
          >
            {ticks}
          </button>
        </span>
        {m.error && <p className="clear-both pt-1 text-[11px] text-danger">Not sent: {m.error}</p>}
      </div>
      {p.kind === "buttons" && (
        <div className="mt-0.5 grid gap-0.5">
          {p.options.map((o) => (
            <button
              key={o.id}
              disabled={disabled}
              onClick={() => onTap(o)}
              className="rounded-lg bg-white py-2 text-center text-sm font-medium text-[#00a884] shadow-sm hover:bg-[#f5f6f6] disabled:opacity-60"
            >
              {o.title}
            </button>
          ))}
        </div>
      )}
      {p.kind === "template" && (p.quickReplies ?? []).length > 0 && (
        <div className="mt-0.5 grid gap-0.5">
          {(p.quickReplies ?? []).map((title) => (
            <button
              key={title}
              disabled={disabled || m.provider !== "simulator"}
              onClick={() => onTap({ id: "", title })}
              className="rounded-lg bg-white py-2 text-center text-sm font-medium text-[#00a884] shadow-sm hover:bg-[#f5f6f6] disabled:opacity-60"
            >
              {title}
            </button>
          ))}
        </div>
      )}
      {p.kind === "list" && (
        <button
          disabled={disabled}
          onClick={() => onOpenList({ button: p.button, options: p.options })}
          className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium text-[#00a884] shadow-sm hover:bg-[#f5f6f6] disabled:opacity-60"
        >
          <List className="size-4" /> {p.button}
        </button>
      )}
    </div>
  );
}

// ── Style notes ──────────────────────────────────────────────────────────────

type StyleNote = { id: string; note: string; original: string | null; active: boolean; createdAt: string };

/** What the owner told the bot in WhatsApp ("feedback: …"). Active notes are in every prompt. */
function StyleNotes() {
  const qc = useQueryClient();
  const notes = useQuery({
    queryKey: [QUERY_KEYS.GET_WHATSAPP_STYLE_NOTES],
    queryFn: async () => (await Axios.get<StyleNote[]>("/api/v1/whatsapp/style-notes")).data,
    refetchInterval: 10_000,
  });
  const toggle = useMutation({
    mutationFn: async (id: string) => (await Axios.post(`/api/v1/whatsapp/style-notes/${id}/toggle`)).data,
    onSettled: () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_WHATSAPP_STYLE_NOTES] }),
  });
  return (
    <Card className="p-4 text-sm">
      <h3 className="font-semibold">Style notes from WhatsApp</h3>
      <p className="mt-1 text-muted-foreground">
        From a coach number, a message starting with "feedback:" (or one that is clearly about how the bot writes)
        becomes a rule the bot follows from its next reply.
      </p>
      <ul className="mt-3 space-y-2">
        {(notes.data ?? []).map((n) => (
          <li key={n.id} className="flex items-start justify-between gap-3">
            <span className={cn(!n.active && "text-muted-foreground line-through")}>{n.note}</span>
            <button onClick={() => toggle.mutate(n.id)} className="shrink-0 text-xs text-muted-foreground hover:text-foreground">
              {n.active ? "Switch off" : "Switch on"}
            </button>
          </li>
        ))}
        {!notes.data?.length && <li className="text-muted-foreground">None yet.</li>}
      </ul>
    </Card>
  );
}

// ── Analytics ────────────────────────────────────────────────────────────────

type Analytics = {
  funnel: { sent: number; delivered: number; read: number; replied: number; failed: number; deliveryRate: number | null; readRate: number | null; replyRate: number | null };
  timeToReadSeconds: { p50: number | null; p90: number | null };
  bySource: Array<{ source: string; sent: number; delivered: number; read: number; replied: number; failed: number; readRate: number | null; replyRate: number | null }>;
  options: { interactiveSent: number; taps: number; tapRate: number | null; aiSuggestionTaps: number; top: Array<{ optionId: string; title: string; taps: number }> };
  handoffs: Array<{ reason: string; contacts: number; booked: number }>;
  stages: Record<string, number>;
  bands: Record<string, number>;
  contacts: Record<string, number>;
  readsByHourIst: Array<{ hour: number; reads: number }>;
};

const pct = (n: number | null) => (n == null ? "—" : `${n}%`);
const dur = (s: number | null) => (s == null ? "—" : s < 90 ? `${Math.round(s)}s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);

function Analytics() {
  const [includeSimulated, setIncludeSimulated] = useState(true);
  const q = useQuery({
    queryKey: [QUERY_KEYS.GET_WHATSAPP_ANALYTICS, includeSimulated],
    queryFn: async () => (await Axios.get<Analytics>("/api/v1/whatsapp/analytics", { params: { includeSimulated } })).data,
  });
  const maxHour = useMemo(() => Math.max(1, ...(q.data?.readsByHourIst ?? []).map((h) => h.reads)), [q.data]);

  if (q.error) return <ErrorState title="Analytics failed" description={getErrorMessage(q.error, "")} />;
  const a = q.data;
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked={includeSimulated} onChange={(e) => setIncludeSimulated(e.target.checked)} />
        Include simulator traffic (last 30 days)
      </label>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Messages sent" value={String(a?.funnel.sent ?? "—")} hint={`${a?.funnel.failed ?? 0} failed`} />
        <StatCard label="Delivered" value={pct(a?.funnel.deliveryRate ?? null)} hint={`${a?.funnel.delivered ?? 0} of sent`} accent="info" />
        <StatCard label="Read" value={pct(a?.funnel.readRate ?? null)} hint={`median ${dur(a?.timeToReadSeconds.p50 ?? null)} to read`} accent="success" />
        <StatCard label="Replied after read" value={pct(a?.funnel.replyRate ?? null)} hint="within 24 hours" accent="gold" />
        <StatCard label="Option tap rate" value={pct(a?.options.tapRate ?? null)} hint={`${a?.options.taps ?? 0} taps on ${a?.options.interactiveSent ?? 0} menus`} />
        <StatCard label="Contacts" value={String(a?.contacts.total ?? "—")} hint={`${a?.contacts.named ?? 0} named, ${a?.contacts.withCourse ?? 0} with a programme`} accent="info" />
        <StatCard label="Handed to counsellor" value={String(a?.contacts.handedOff ?? "—")} accent="warning" />
        <StatCard label="Opted out" value={String(a?.contacts.optedOut ?? "—")} accent="danger" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="font-semibold">By source</h3>
          <p className="text-xs text-muted-foreground">Follow-ups are judged on reads and replies, not sends.</p>
          <table className="mt-3 w-full text-xs">
            <thead className="text-left uppercase tracking-wider text-muted-foreground">
              <tr><th className="pb-2">Source</th><th className="pb-2 text-right">Sent</th><th className="pb-2 text-right">Delivered</th><th className="pb-2 text-right">Read</th><th className="pb-2 text-right">Read %</th><th className="pb-2 text-right">Reply %</th></tr>
            </thead>
            <tbody>
              {(a?.bySource ?? []).map((r) => (
                <tr key={r.source} className="border-t border-border">
                  <td className="py-2 font-medium capitalize">{r.source}</td>
                  <td className="py-2 text-right tabular-nums">{r.sent}</td>
                  <td className="py-2 text-right tabular-nums">{r.delivered}</td>
                  <td className="py-2 text-right tabular-nums">{r.read}</td>
                  <td className="py-2 text-right tabular-nums">{pct(r.readRate)}</td>
                  <td className="py-2 text-right tabular-nums">{pct(r.replyRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold">What people tap</h3>
          <p className="text-xs text-muted-foreground">Menu and handoff options. {a?.options.aiSuggestionTaps ?? 0} taps on the bot's own suggestions.</p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(a?.options.top ?? []).map((o) => (
              <li key={o.optionId} className="flex justify-between gap-2">
                <span>{o.title}</span>
                <span className="tabular-nums text-muted-foreground">{o.taps}</span>
              </li>
            ))}
            {!a?.options.top.length && <li className="text-muted-foreground">No taps yet.</li>}
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold">How likely they are to convert</h3>
          <p className="text-xs text-muted-foreground">
            Everyone who replied in this window, by band. The score and its reasons are on each contact.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(["hot", "warm", "cool", "cold", "unscored"] as const).map((band) => (
              <li key={band} className="flex items-center justify-between gap-2">
                <Badge tone={SCORE_TONES[band as keyof typeof SCORE_TONES] ?? "muted"}>{band}</Badge>
                <span className="tabular-nums text-muted-foreground">{a?.bands?.[band] ?? 0}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold">Handoffs by reason</h3>
          <ul className="mt-3 space-y-1.5 text-sm">
            {(a?.handoffs ?? []).map((h) => (
              <li key={h.reason} className="flex justify-between gap-2">
                <span className="capitalize">{h.reason.replace(/_/g, " ")}</span>
                <span className="tabular-nums text-muted-foreground">{h.contacts} ({h.booked} booked a call or chat)</span>
              </li>
            ))}
            {!a?.handoffs.length && <li className="text-muted-foreground">None yet.</li>}
          </ul>
        </Card>

        <Card className="p-4">
          <h3 className="font-semibold">When messages get read (IST)</h3>
          <p className="text-xs text-muted-foreground">Where to time follow-ups and campaigns.</p>
          <div className="mt-3 flex h-28 items-end gap-0.5">
            {Array.from({ length: 24 }, (_, h) => {
              const reads = a?.readsByHourIst.find((x) => x.hour === h)?.reads ?? 0;
              return (
                <div key={h} className="flex flex-1 flex-col items-center gap-1" title={`${h}:00 · ${reads} reads`}>
                  <div className="w-full rounded-t bg-primary/70" style={{ height: `${(reads / maxHour) * 96}px` }} />
                  {h % 6 === 0 && <span className="text-[9px] text-muted-foreground">{h}</span>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── Contacts ─────────────────────────────────────────────────────────────────

/**
 * How likely this person is to convert, 0 to 100, worked out from what they
 * said, how fast they answer and how far their application has gone (the
 * server computes it; see whatsapp-score.ts).
 */
const SCORE_TONES = {
  hot: "danger-light",
  warm: "warning-light",
  cool: "primary-light",
  cold: "muted",
} as const;

function ScoreBadge({ score, band }: { score: number | null; band: string | null }) {
  if (score === null || score === undefined) return <span className="text-muted-foreground">—</span>;
  const tone = SCORE_TONES[(band ?? "cold") as keyof typeof SCORE_TONES] ?? "muted";
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={tone}>{band ?? "—"}</Badge>
      <span className="tabular-nums text-muted-foreground">{score}</span>
    </span>
  );
}

type ScoreSignal = { label: string; points: number };

type ContactRow = {
  id: string;
  waId: string;
  name: string | null;
  courseInterest: string | null;
  stage: string;
  score: number | null;
  scoreBand: string | null;
  handoffReason: string | null;
  lastInboundAt: string | null;
  nextFollowupAt: string | null;
  optedOutAt: string | null;
  simulated: boolean;
  /** The conversation behind this number, so a row can open its transcript. */
  visitorId: string;
};

function Contacts() {
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: [QUERY_KEYS.GET_WHATSAPP_CONTACTS],
    queryFn: async () => (await Axios.get<ContactRow[]>("/api/v1/whatsapp/contacts", { params: { simulated: true } })).data,
  });
  if (q.error) return <ErrorState title="Could not load contacts" description={getErrorMessage(q.error, "")} />;
  return (
    <Card className="overflow-x-auto p-4">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
          <tr><th className="pb-2">Number</th><th className="pb-2">Name</th><th className="pb-2">Programme</th><th className="pb-2">Likely to convert</th><th className="pb-2">Stage</th><th className="pb-2">Handoff</th><th className="pb-2">Last message</th><th className="pb-2">Next follow-up</th></tr>
        </thead>
        <tbody>
          {[...(q.data ?? [])].sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).map((c) => (
            <tr
              key={c.id}
              className="cursor-pointer border-t border-border hover:bg-muted/50"
              title="Open this conversation"
              onClick={() => navigate({ to: "/conversations", search: { visitorId: c.visitorId } })}
            >
              <td className="py-2 tabular-nums">+{c.waId} {c.simulated && <Badge tone="muted">sim</Badge>}</td>
              <td className="py-2">{c.name ?? "—"}</td>
              <td className="py-2">{c.courseInterest ?? "—"}</td>
              <td className="py-2"><ScoreBadge score={c.score} band={c.scoreBand} /></td>
              <td className="py-2"><Badge tone={c.optedOutAt ? "danger-light" : "primary-light"}>{c.optedOutAt ? "opted out" : c.stage}</Badge></td>
              <td className="py-2">{c.handoffReason?.replace(/_/g, " ") ?? "—"}</td>
              <td className="py-2 text-muted-foreground">{c.lastInboundAt ? new Date(c.lastInboundAt).toLocaleString() : "—"}</td>
              <td className="py-2 text-muted-foreground">{c.nextFollowupAt ? new Date(c.nextFollowupAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
          {!q.data?.length && (
            <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Nobody yet.</td></tr>
          )}
        </tbody>
      </table>
    </Card>
  );
}

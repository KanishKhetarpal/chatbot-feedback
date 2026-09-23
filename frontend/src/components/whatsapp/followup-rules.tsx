/**
 * Follow-up rules: which leads get which follow-ups, by stage, and when. Each rule
 * matches stages (the CRM's own statuses, or the bot's) and runs a short ladder
 * of steps timed from Tara's last message. Everything here is live: saving
 * re-plans every lead's next follow-up.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Clock, Pencil, Plus, Trash2, X } from "lucide-react";

import { Badge, Card } from "@/components/ui-kit";
import { ErrorState } from "@/components/ui/empty-state";
import Axios, { getErrorMessage } from "@/lib/axios-config";
import { QUERY_KEYS } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

type StepWhen = "always" | "read_no_reply" | "not_read";
type Step = {
  delayHours: number;
  action: "ai" | "template";
  goal?: string;
  template?: { name: string; language: string; params: string[] };
  when: StepWhen;
};
type Rule = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  priority: number;
  stages: string[];
  /** Only chase leads whose conversion score is in this range. Null = any. */
  minScore: number | null;
  maxScore: number | null;
  steps: Step[];
  quietStart: string;
  quietEnd: string;
};
type Stages = { bot: string[]; crm: Array<{ status: string; leads: number }> };
type Template = { name: string; language: string; category: string; bodyVariables: number; body: string; usable: boolean };
type Upcoming = { contactId: string; waId: string; name: string | null; stage: string | null; rule: string | null; step: number; action: string | null; goal: string | null; dueAt: string; simulated: boolean };
type Stat = { ruleId: string; step: number; sent: number; read: number; replied: number };

const WHEN_LABEL: Record<StepWhen, string> = {
  always: "Always",
  read_no_reply: "Only if they read the last message",
  not_read: "Only if they have not read it",
};
const TOKENS = [
  { value: "first_name", label: "First name" },
  { value: "course", label: "Course" },
  { value: "city", label: "City" },
  { value: "counsellor", label: "Counsellor" },
];
const BOT_STAGE_LABEL: Record<string, string> = {
  "bot:new": "Bot: messaged, no reply yet",
  "bot:engaged": "Bot: chatting",
  "bot:qualified": "Bot: course known",
  "bot:counsellor": "Bot: handed to a counsellor",
  "bot:lost": "Bot: opted out or lost",
};
const stageLabel = (s: string) => BOT_STAGE_LABEL[s] ?? s.replace(/_/g, " ");

/** "3h", "1d 2h" */
function delayLabel(hours: number): string {
  if (hours < 24) return `${+hours.toFixed(2)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return h ? `${d}d ${h}h` : `${d}d`;
}

const emptyRule = (): Omit<Rule, "id"> => ({
  name: "",
  description: "",
  active: true,
  priority: 50,
  stages: [],
  minScore: null,
  maxScore: null,
  steps: [{ delayHours: 3, action: "ai", goal: "", when: "always" }],
  quietStart: "20:30",
  quietEnd: "09:30",
});

export function FollowupRules() {
  const qc = useQueryClient();
  const rules = useQuery({ queryKey: [QUERY_KEYS.GET_WHATSAPP_FOLLOWUP_RULES], queryFn: async () => (await Axios.get<Rule[]>("/api/v1/whatsapp/followup-rules")).data });
  const stages = useQuery({ queryKey: [QUERY_KEYS.GET_WHATSAPP_FOLLOWUP_STAGES], queryFn: async () => (await Axios.get<Stages>("/api/v1/whatsapp/followup-stages")).data });
  const templates = useQuery({ queryKey: [QUERY_KEYS.GET_WHATSAPP_TEMPLATES], queryFn: async () => (await Axios.get<{ templates: Template[] }>("/api/v1/whatsapp/templates")).data.templates });
  const upcoming = useQuery({ queryKey: [QUERY_KEYS.GET_WHATSAPP_FOLLOWUP_UPCOMING], queryFn: async () => (await Axios.get<Upcoming[]>("/api/v1/whatsapp/followups/upcoming")).data, refetchInterval: 30_000 });
  const stats = useQuery({ queryKey: [QUERY_KEYS.GET_WHATSAPP_FOLLOWUP_STATS], queryFn: async () => (await Axios.get<Stat[]>("/api/v1/whatsapp/followups/stats")).data });
  const [editing, setEditing] = useState<(Omit<Rule, "id"> & { id?: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    for (const k of [QUERY_KEYS.GET_WHATSAPP_FOLLOWUP_RULES, QUERY_KEYS.GET_WHATSAPP_FOLLOWUP_UPCOMING, QUERY_KEYS.GET_WHATSAPP_FOLLOWUP_STATS]) qc.invalidateQueries({ queryKey: [k] });
  };
  const save = useMutation({
    mutationFn: async (rule: Omit<Rule, "id"> & { id?: string }) => {
      const { id, ...body } = rule;
      return (await Axios.post(id ? `/api/v1/whatsapp/followup-rules/${id}` : "/api/v1/whatsapp/followup-rules", body)).data;
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError: (err) => setError(getErrorMessage(err, "The rule was not saved.")),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => (await Axios.post(`/api/v1/whatsapp/followup-rules/${id}/delete`)).data,
    onSuccess: refresh,
  });

  const statFor = (ruleId: string, step: number) => stats.data?.find((s) => s.ruleId === ruleId && s.step === step);
  const covered = useMemo(() => new Set((rules.data ?? []).filter((r) => r.active).flatMap((r) => r.stages)), [rules.data]);

  if (rules.error) return <ErrorState title="Could not load follow-up rules" description={getErrorMessage(rules.error, "")} />;

  return (
    <div className="space-y-4">
      <Card className="p-4 text-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h3 className="font-semibold">How follow-ups work</h3>
            <p className="mt-1 text-muted-foreground">
              When a lead stops replying, Tara follows up on the first active rule that matches their stage. The stage is
              their CRM status (read every 30 minutes) or, if the CRM does not know them, the bot's own. Step delays count
              from Tara's last message. Any reply from them, or a change of stage, starts the ladder again. AI steps can
              only go out inside WhatsApp's 24 hour window; after that, only approved templates can. Nothing is sent in
              quiet hours (IST).
            </p>
          </div>
          <button
            onClick={() => setEditing(emptyRule())}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="size-3.5" /> New rule
          </button>
        </div>
      </Card>

      <div className="grid gap-3">
        {(rules.data ?? []).map((r) => (
          <Card key={r.id} className={cn("p-4", !r.active && "opacity-60")}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold">{r.name}</h4>
                  <Badge tone={r.active ? "success-light" : "muted"}>{r.active ? "Active" : "Off"}</Badge>
                  <Badge tone="muted">Priority {r.priority}</Badge>
                  {r.minScore !== null || r.maxScore !== null ? (
                    <Badge tone="muted">
                      score {r.minScore ?? 0} to {r.maxScore ?? 100}
                    </Badge>
                  ) : null}
                  <Badge tone="muted">
                    <Clock className="size-3" /> quiet {r.quietStart} to {r.quietEnd}
                  </Badge>
                </div>
                {r.description && <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>}
                <div className="mt-2 flex flex-wrap gap-1">
                  {r.stages.map((s) => (
                    <Badge key={s} tone="primary-light">
                      {stageLabel(s)}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => save.mutate({ ...r, active: !r.active })} className="rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted">
                  {r.active ? "Switch off" : "Switch on"}
                </button>
                <button onClick={() => setEditing({ ...r })} className="rounded-lg border border-border p-1.5 hover:bg-muted" title="Edit">
                  <Pencil className="size-3.5" />
                </button>
                <button
                  onClick={() => window.confirm(`Delete "${r.name}"?`) && remove.mutate(r.id)}
                  className="rounded-lg border border-border p-1.5 text-danger hover:bg-muted"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
            <ol className="mt-3 space-y-1.5 text-sm">
              {r.steps.map((s, i) => {
                const st = statFor(r.id, i + 1);
                return (
                  <li key={i} className="flex flex-wrap items-baseline gap-2">
                    <span className="w-16 shrink-0 font-mono text-xs text-muted-foreground">+{delayLabel(s.delayHours)}</span>
                    <Badge tone={s.action === "ai" ? "info-light" : "gold-light"}>{s.action === "ai" ? "AI message" : "Template"}</Badge>
                    <span className="min-w-0 flex-1">{s.action === "ai" ? s.goal : `${s.template?.name} (${s.template?.language})`}</span>
                    {s.when !== "always" && <span className="text-xs text-muted-foreground">{WHEN_LABEL[s.when]}</span>}
                    {st && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {st.sent} sent · {st.read} read · {st.replied} replied
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </Card>
        ))}
      </div>

      {stages.data && (
        <Card className="p-4 text-sm">
          <h3 className="font-semibold">Stages with no follow-up</h3>
          <p className="mt-1 text-muted-foreground">Leads in these stages get nothing automatic. That is right for some (enrolled, not interested); add a rule for the rest.</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {[...stages.data.crm.map((s) => ({ key: s.status, leads: s.leads })), ...stages.data.bot.map((s) => ({ key: s, leads: null as number | null }))]
              .filter((s) => !covered.has(s.key))
              .map((s) => (
                <Badge key={s.key} tone="muted">
                  {stageLabel(s.key)}
                  {s.leads != null ? ` · ${s.leads} leads` : ""}
                </Badge>
              ))}
          </div>
        </Card>
      )}

      <Card className="overflow-x-auto p-4">
        <h3 className="font-semibold">Next follow-ups</h3>
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="pb-2">Due</th>
              <th className="pb-2">Lead</th>
              <th className="pb-2">Stage</th>
              <th className="pb-2">Rule</th>
              <th className="pb-2">Step</th>
            </tr>
          </thead>
          <tbody>
            {(upcoming.data ?? []).map((u) => (
              <tr key={u.contactId} className="border-t border-border">
                <td className="py-2 tabular-nums">{new Date(u.dueAt).toLocaleString()}</td>
                <td className="py-2">
                  {u.name ?? `+${u.waId}`} {u.simulated && <Badge tone="muted">sim</Badge>}
                </td>
                <td className="py-2">{u.stage ? stageLabel(u.stage) : "—"}</td>
                <td className="py-2">{u.rule ?? "—"}</td>
                <td className="py-2 text-muted-foreground">
                  {u.step}. {u.action === "ai" ? "AI" : "Template"}: {u.goal}
                </td>
              </tr>
            ))}
            {!upcoming.data?.length && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-muted-foreground">
                  Nothing scheduled.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editing && (
        <RuleEditor
          value={editing}
          stages={stages.data}
          templates={(templates.data ?? []).filter((t) => t.usable)}
          saving={save.isPending}
          error={error}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={(r) => save.mutate(r)}
        />
      )}
    </div>
  );
}

function RuleEditor({
  value,
  stages,
  templates,
  saving,
  error,
  onCancel,
  onSave,
}: {
  value: Omit<Rule, "id"> & { id?: string };
  stages?: Stages;
  templates: Template[];
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (r: Omit<Rule, "id"> & { id?: string }) => void;
}) {
  const [rule, setRule] = useState(value);
  const set = (patch: Partial<typeof rule>) => setRule((r) => ({ ...r, ...patch }));
  const setStep = (i: number, patch: Partial<Step>) => set({ steps: rule.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const toggleStage = (s: string) => set({ stages: rule.stages.includes(s) ? rule.stages.filter((x) => x !== s) : [...rule.stages, s] });
  const move = (i: number, d: -1 | 1) => {
    const steps = [...rule.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    set({ steps });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onCancel}>
      <div className="my-8 w-full max-w-3xl rounded-xl border border-border bg-card p-5 shadow-elev-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">{rule.id ? "Edit rule" : "New rule"}</h3>
          <button onClick={onCancel} className="rounded-lg p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_120px]">
          <label className="text-sm">
            <span className="text-muted-foreground">Name</span>
            <input value={rule.name} onChange={(e) => set({ name: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-muted-foreground">Priority</span>
            <input
              type="number"
              value={rule.priority}
              onChange={(e) => set({ priority: Number(e.target.value) })}
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
            />
          </label>
        </div>
        <label className="mt-3 block text-sm">
          <span className="text-muted-foreground">What it is for (internal)</span>
          <input value={rule.description ?? ""} onChange={(e) => set({ description: e.target.value })} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" />
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium">Stages it applies to</p>
          <p className="text-xs text-muted-foreground">CRM statuses, and the bot's own stages for people the CRM does not know.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[...(stages?.crm ?? []).map((s) => ({ key: s.status, extra: `${s.leads}` })), ...(stages?.bot ?? []).map((s) => ({ key: s, extra: "" }))].map((s) => (
              <button
                key={s.key}
                onClick={() => toggleStage(s.key)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs",
                  rule.stages.includes(s.key) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {stageLabel(s.key)}
                {s.extra ? ` · ${s.extra}` : ""}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium">Only for leads this likely to convert</p>
          <p className="text-xs text-muted-foreground">
            The score on the Contacts tab, 0 to 100. Leave both blank to chase everyone in those stages; a hot-lead rule
            wants a high floor, a win-back rule a low ceiling.
          </p>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">From</span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="any"
                value={rule.minScore ?? ""}
                onChange={(e) => set({ minScore: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-20 rounded-lg border border-border bg-background px-2 py-1"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-muted-foreground">to</span>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="any"
                value={rule.maxScore ?? ""}
                onChange={(e) => set({ maxScore: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-20 rounded-lg border border-border bg-background px-2 py-1"
              />
            </label>
          </div>
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium">Steps</p>
          <p className="text-xs text-muted-foreground">Each delay counts from Tara's last message. Each step must come later than the one before.</p>
          <div className="mt-2 space-y-3">
            {rule.steps.map((s, i) => {
              const days = s.delayHours >= 24 && s.delayHours % 24 === 0;
              const tpl = templates.find((t) => t.name === s.template?.name && t.language === s.template?.language);
              return (
                <div key={i} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">Step {i + 1}: after</span>
                    <input
                      type="number"
                      min={days ? 1 : 0.25}
                      step={days ? 1 : 0.5}
                      value={days ? s.delayHours / 24 : s.delayHours}
                      onChange={(e) => setStep(i, { delayHours: Number(e.target.value) * (days ? 24 : 1) })}
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1"
                    />
                    <select
                      value={days ? "days" : "hours"}
                      onChange={(e) => setStep(i, { delayHours: e.target.value === "days" ? Math.max(1, Math.round(s.delayHours / 24)) * 24 : Math.max(1, s.delayHours / 24) })}
                      className="rounded-lg border border-border bg-background px-2 py-1"
                    >
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                    <span>send</span>
                    <select
                      value={s.action}
                      onChange={(e) => setStep(i, e.target.value === "ai" ? { action: "ai", template: undefined } : { action: "template", template: { name: templates[0]?.name ?? "", language: templates[0]?.language ?? "en", params: [] } })}
                      className="rounded-lg border border-border bg-background px-2 py-1"
                    >
                      <option value="ai">an AI message (24h window only)</option>
                      <option value="template">an approved template</option>
                    </select>
                    <select value={s.when} onChange={(e) => setStep(i, { when: e.target.value as StepWhen })} className="rounded-lg border border-border bg-background px-2 py-1">
                      {Object.entries(WHEN_LABEL).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <div className="ml-auto flex gap-1">
                      <button disabled={i === 0} onClick={() => move(i, -1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button disabled={i === rule.steps.length - 1} onClick={() => move(i, 1)} className="rounded p-1 hover:bg-muted disabled:opacity-30">
                        <ArrowDown className="size-3.5" />
                      </button>
                      <button disabled={rule.steps.length === 1} onClick={() => set({ steps: rule.steps.filter((_, j) => j !== i) })} className="rounded p-1 text-danger hover:bg-muted disabled:opacity-30">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                  {s.action === "ai" ? (
                    <textarea
                      value={s.goal ?? ""}
                      onChange={(e) => setStep(i, { goal: e.target.value })}
                      rows={2}
                      placeholder="What Tara should try to achieve, e.g. help them finish the application: ask what is pending and offer to walk them through it."
                      className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  ) : (
                    <div className="mt-2 space-y-2 text-sm">
                      <select
                        value={s.template ? `${s.template.name}:${s.template.language}` : ""}
                        onChange={(e) => {
                          const [name, language] = e.target.value.split(":");
                          setStep(i, { template: { name, language, params: [] } });
                        }}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2"
                      >
                        {templates.map((t) => (
                          <option key={`${t.name}:${t.language}`} value={`${t.name}:${t.language}`}>
                            {t.name} ({t.language}, {t.category.toLowerCase()})
                          </option>
                        ))}
                      </select>
                      {tpl && <p className="whitespace-pre-wrap rounded-lg bg-muted/60 p-2 text-xs">{tpl.body}</p>}
                      {tpl &&
                        Array.from({ length: tpl.bodyVariables }, (_, k) => {
                          const cur = s.template?.params[k] ?? "";
                          const isToken = TOKENS.some((t) => t.value === cur);
                          return (
                            <div key={k} className="flex items-center gap-2">
                              <span className="w-12 font-mono text-xs text-muted-foreground">{`{{${k + 1}}}`}</span>
                              <select
                                value={isToken ? cur : "__text"}
                                onChange={(e) => {
                                  const params = [...(s.template?.params ?? [])];
                                  params[k] = e.target.value === "__text" ? "" : e.target.value;
                                  setStep(i, { template: { ...s.template!, params } });
                                }}
                                className="rounded-lg border border-border bg-background px-2 py-1"
                              >
                                {TOKENS.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                                <option value="__text">Fixed text…</option>
                              </select>
                              {!isToken && (
                                <input
                                  value={cur}
                                  onChange={(e) => {
                                    const params = [...(s.template?.params ?? [])];
                                    params[k] = e.target.value;
                                    setStep(i, { template: { ...s.template!, params } });
                                  }}
                                  className="flex-1 rounded-lg border border-border bg-background px-2 py-1"
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button
            onClick={() => {
              const last = rule.steps[rule.steps.length - 1];
              set({ steps: [...rule.steps, { delayHours: (last?.delayHours ?? 0) + 24, action: "ai", goal: "", when: "always" }] });
            }}
            className="mt-2 inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
          >
            <Plus className="size-3.5" /> Add step
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Quiet hours (IST): no messages from</span>
          <input type="time" value={rule.quietStart} onChange={(e) => set({ quietStart: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1" />
          <span className="text-muted-foreground">to</span>
          <input type="time" value={rule.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} className="rounded-lg border border-border bg-background px-2 py-1" />
          <label className="ml-auto flex items-center gap-2">
            <input type="checkbox" checked={rule.active} onChange={(e) => set({ active: e.target.checked })} /> Active
          </label>
        </div>

        {error && <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={saving || !rule.name.trim() || !rule.stages.length}
            onClick={() =>
              onSave({
                ...rule,
                steps: rule.steps.map((s) => (s.action === "ai" ? { delayHours: s.delayHours, action: "ai", goal: s.goal, when: s.when } : { delayHours: s.delayHours, action: "template", template: s.template, when: s.when })),
              })
            }
            className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save rule"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, CheckCircle2, Copy, Rocket } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { ChatAgentDangerZone } from "@/components/chat-agents/delete-agent";
import { useUpdateChatAgent } from "@/components/chat-agents/hook/mutation/use-chat-agent-mutations";
import { useGetKnowledgeSources } from "@/components/chat-agents/hook/query/use-get-knowledge";
import { SectionHeading } from "@/components/chat-agents/profile-sections";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { SelectField } from "@/components/ui/form-fields/select-field";
import { TagsField } from "@/components/ui/form-fields/tags-field";
import { getErrorMessage } from "@/lib/axios-config";
import { buildEmbedSnippet } from "@/lib/chat-agent-constants";
import { validateOriginTag } from "@/zod/chat-agent-schema";
import { cn } from "@/lib/utils";
import type { ChatAgent } from "@/types/chat-agent-types";

const deploySchema = z.object({
  allowedOrigins: z.array(z.string()).max(20),
  status: z.enum(["draft", "active", "paused"]),
});

type DeployFormValues = z.infer<typeof deploySchema>;

function deployValuesFrom(agent: ChatAgent): DeployFormValues {
  return { allowedOrigins: agent.allowedOrigins ?? [], status: agent.status };
}

export function DeployPanel({ agent }: { agent: ChatAgent }) {
  const patchAgent = useUpdateChatAgent(agent.id);
  const sourcesQuery = useGetKnowledgeSources(agent.id);
  const sources = sourcesQuery.data ?? [];

  const form = useForm<DeployFormValues>({
    resolver: zodResolver(deploySchema),
    defaultValues: deployValuesFrom(agent),
  });

  useEffect(() => {
    form.reset(deployValuesFrom(agent));
  }, [agent, form]);

  // No fetch: `publicKey` rides on the chatbot itself, and the snippet's only
  // other ingredient is this app's own origin — so the Deploy tab renders it on
  // first paint rather than after a round trip. See `buildEmbedSnippet`.
  const snippet = buildEmbedSnippet(agent.publicKey);
  const shareUrl = `${window.location.origin}/s/${agent.publicKey}`;

  const origins = form.watch("allowedOrigins");
  const hasReadyKnowledge = sources.some((s) => s.status === "ready" && s.enabled);
  const hasGreeting = Boolean(agent.greeting?.trim());
  // This app's own origin is always allowed, so share links and the in-app chat
  // work with an empty list. Origins are only needed to embed on another site.
  void origins;
  const canPublish = hasReadyKnowledge && hasGreeting;

  const checklist = [
    { ok: hasReadyKnowledge, label: "At least one enabled knowledge source is ready (Knowledge tab, then Train)" },
    { ok: hasGreeting, label: "A greeting is set on the Profile tab" },
  ];

  async function onSave(values: DeployFormValues) {
    if (values.status === "active" && !canPublish) {
      toast.error("Finish the publish checklist before setting the status to active");
      return;
    }

    const patch: Partial<DeployFormValues> = {};
    if (form.formState.dirtyFields.allowedOrigins) patch.allowedOrigins = values.allowedOrigins;
    if (form.formState.dirtyFields.status) patch.status = values.status;

    if (!Object.keys(patch).length) {
      toast.message("No changes to save");
      return;
    }

    try {
      const updated = await patchAgent.mutateAsync(patch);
      form.reset(deployValuesFrom(updated));
      toast.success("Deploy settings saved");
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not save deploy settings"));
    }
  }

  return (
    <div className="space-y-5">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSave)} className="space-y-5">
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-elev-1">
            <span
              className={cn(
                "grid size-11 shrink-0 place-items-center rounded-xl",
                agent.status === "active"
                  ? "bg-success/15 text-success"
                  : "bg-primary/12 text-primary",
              )}
            >
              {agent.status === "active" ? (
                <CheckCircle2 className="size-5" />
              ) : (
                <Rocket className="size-5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium capitalize">Status: {agent.status}</p>
              <p className="text-xs text-muted-foreground">
                {sources.length} knowledge {sources.length === 1 ? "source" : "sources"} ·{" "}
                {agent.tone} tone · {agent.knowledgeMode} mode
              </p>
            </div>
          </div>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-elev-1">
            <SectionHeading
              title="Share link"
              hint="Send this to anyone you want feedback from. No account needed; every conversation is recorded under Conversations."
            />
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                {shareUrl}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(shareUrl);
                  toast.success("Share link copied");
                }}
              >
                <Copy className="size-3.5" /> Copy
              </Button>
              <Button type="button" size="sm" variant="outline" asChild>
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  Open
                </a>
              </Button>
            </div>
            {agent.status !== "active" ? (
              <p className="text-xs text-warning">The link only answers while the status is Active.</p>
            ) : null}
          </section>

          <section className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-elev-1">
            <SectionHeading
              title="Where it may run"
              hint="Extra websites that may embed this chatbot with the script tag. The public key is visible in the page source; this list is what stops other sites from mounting it."
            />
            <TagsField
              control={form.control}
              name="allowedOrigins"
              label="Allowed origins"
              placeholder="https://www.example.com"
              hint="Full URL with scheme, no path. localhost and 127.0.0.1 count as different origins."
              maxTags={20}
              validateTag={validateOriginTag}
            />
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              The share link and the in-app chat always work — this app&apos;s own address is allowed
              automatically. Add a site here only if you want to embed the chatbot on it with the script tag below.
            </p>
            <SelectField
              control={form.control}
              name="status"
              label="Status"
              options={[
                { value: "draft", label: "Draft" },
                { value: "active", label: "Active" },
                { value: "paused", label: "Paused" },
              ]}
            />
            <Button
              type="submit"
              size="sm"
              disabled={patchAgent.isPending || !form.formState.isDirty}
            >
              {patchAgent.isPending ? "Saving…" : "Save deploy settings"}
            </Button>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-elev-1">
            <SectionHeading
              title="Publish checklist"
              hint="The status cannot be set to active until every item is met."
            />
            <ul className="space-y-2">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-start gap-2 text-sm">
                  <span
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px]",
                      item.ok ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {item.ok ? <Check className="size-3" /> : "·"}
                  </span>
                  <span className={item.ok ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-elev-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <SectionHeading
                title="Embed snippet"
                hint="Paste this immediately before the closing &lt;/body&gt; tag on every page the widget should appear on."
              />
              <CopyButton value={snippet} label="Copy" />
            </div>

            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/60 p-3 text-[11px] leading-relaxed">
              <code>{snippet}</code>
            </pre>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Public key</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">
                {agent.publicKey}
              </code>
              <CopyButton value={agent.publicKey} label="Copy key" />
            </div>
          </section>
        </form>
      </Form>

      {/* Outside the <form> on purpose: a destructive action has no business
          sharing a submit handler with "Save deploy settings", and nesting one
          form inside another is invalid HTML anyway. */}
      <ChatAgentDangerZone agent={agent} />
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        toast.success("Copied to clipboard");
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {copied ? "Copied" : label}
    </Button>
  );
}

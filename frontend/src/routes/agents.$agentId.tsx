import { useCallback, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Cpu, MessageSquareText, Palette, UserPlus, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import { AppShell } from "@/components/app-shell";
import { ChatAgentStatusBadge } from "@/components/chat-agents/agent-cards";
import { AppearanceSection } from "@/components/chat-agents/appearance-section";
import { ChatAgentActionsMenu } from "@/components/chat-agents/delete-agent";
import { DeployPanel } from "@/components/chat-agents/deploy-panel";
import { GuidedFlowPanel } from "@/components/chat-agents/guided-flow";
import { useUpdateChatAgent } from "@/components/chat-agents/hook/mutation/use-chat-agent-mutations";
import { useGetChatAgent, useGetChatAgentOptions } from "@/components/chat-agents/hook/query/use-get-chat-agents";
import { KnowledgePanel } from "@/components/chat-agents/knowledge-panel";
import { BehaviourSection, IdentitySection, LeadsSection, ModelSection } from "@/components/chat-agents/profile-sections";
import { WidgetPreview } from "@/components/chat-agents/widget-preview";
import { ChatAgentDetailSkeleton } from "@/components/skeletons";
import { PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { Form } from "@/components/ui/form";
import { getErrorMessage } from "@/lib/axios-config";
import { Config } from "@/lib/config";
import {
  chatAgentFormSchema,
  chatAgentToFormValues,
  dirtyChatAgentPatch,
  EMPTY_CHAT_AGENT_FORM_VALUES,
  type ChatAgentFormValues,
} from "@/zod/chat-agent-schema";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/store/use-user-store";

const TABS = ["profile", "knowledge", "flow", "deploy"] as const;
const SECTIONS = ["identity", "appearance", "behaviour", "model", "leads"] as const;

const SECTION_LABELS: Record<(typeof SECTIONS)[number], string> = {
  identity: "Identity",
  appearance: "Appearance",
  behaviour: "Behaviour",
  model: "Model",
  leads: "Contact capture",
};

const SECTION_ICONS: Record<(typeof SECTIONS)[number], LucideIcon> = {
  identity: UserRound,
  appearance: Palette,
  behaviour: MessageSquareText,
  model: Cpu,
  leads: UserPlus,
};

const searchSchema = z.object({
  tab: z.enum(TABS).optional().catch("profile"),
  section: z.enum(SECTIONS).optional().catch("identity"),
});

export const Route = createFileRoute("/agents/$agentId")({
  validateSearch: searchSchema,
  component: ChatAgentDetailPage,
  head: () => ({ meta: [{ title: `Configure chatbot — ${Config.APP_NAME}` }] }),
});

function ChatAgentDetailPage() {
  const { agentId } = Route.useParams();
  const { tab = "profile", section = "identity" } = Route.useSearch();
  const navigate = useNavigate({ from: "/agents/$agentId" });
  const isAdmin = useIsAdmin();

  const { data: agent, isLoading, isError, error, refetch, isFetching } = useGetChatAgent(agentId);
  const { data: options } = useGetChatAgentOptions();
  const patchAgent = useUpdateChatAgent(agentId);

  const form = useForm<ChatAgentFormValues>({
    resolver: zodResolver(chatAgentFormSchema),
    defaultValues: EMPTY_CHAT_AGENT_FORM_VALUES,
    mode: "onBlur",
  });

  useEffect(() => {
    if (agent) form.reset(chatAgentToFormValues(agent));
  }, [agent, form]);

  const isDirty = form.formState.isDirty;

  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  const save = useCallback(async () => {
    const valid = await form.trigger();
    if (!valid) {
      toast.error("Fix the highlighted fields before saving.");
      return;
    }
    const patch = dirtyChatAgentPatch(form.getValues(), form.formState.dirtyFields);
    if (!Object.keys(patch).length) {
      toast.message("No changes to save");
      return;
    }
    try {
      const updated = await patchAgent.mutateAsync(patch);
      form.reset(chatAgentToFormValues(updated));
      toast.success("Saved");
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not save"));
    }
  }, [form, patchAgent]);

  if (!isAdmin) {
    return (
      <AppShell>
        <ErrorState title="Admins only" description="Configuring chatbots needs an admin account." />
      </AppShell>
    );
  }

  if (isLoading) return <ChatAgentDetailSkeleton />;

  if (isError || !agent) {
    return (
      <AppShell noPadding className="h-screen">
        <PageHeader title="Chatbot" handleBack={() => void navigate({ to: "/" })} />
        <div className="flex-1 border-t border-border p-4">
          <ErrorState
            title="Couldn't load this chatbot"
            description={getErrorMessage(error, "It may have been deleted.")}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
          />
        </div>
      </AppShell>
    );
  }

  const values = form.watch();
  const showPreview = tab === "profile" || tab === "knowledge";

  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      <PageHeader
        title={agent.name || "Untitled chatbot"}
        titleExtra={<ChatAgentStatusBadge status={agent.status} />}
        handleBack={() => void navigate({ to: "/" })}
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-muted/50 p-0.5">
              {TABS.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => void navigate({ search: { tab: entry, section } })}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                    tab === entry ? "bg-background text-foreground shadow-elev-1" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {entry}
                </button>
              ))}
            </div>
            {tab === "profile" ? (
              <Button type="button" size="sm" onClick={() => void save()} disabled={!isDirty || patchAgent.isPending}>
                {patchAgent.isPending ? "Saving…" : isDirty ? "Save changes" : "Saved"}
              </Button>
            ) : null}
            <ChatAgentActionsMenu agent={agent} />
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 overflow-hidden border-t border-border">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === "profile" ? (
            <>
              <div className="flex shrink-0 items-center border-b border-border pr-3">
                <nav className="flex flex-1 gap-1 overflow-x-auto overflow-y-hidden px-3">
                  {SECTIONS.map((entry) => {
                    const Icon = SECTION_ICONS[entry];
                    const active = section === entry;
                    return (
                      <button
                        key={entry}
                        type="button"
                        onClick={() => void navigate({ search: { tab, section: entry } })}
                        className={cn(
                          "-mb-px flex items-center gap-2 border-b-3 px-3 py-3.25 text-sm font-medium whitespace-nowrap transition-colors",
                          active ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {SECTION_LABELS[entry]}
                      </button>
                    );
                  })}
                </nav>
                {isDirty ? <span className="shrink-0 text-[11px] font-medium text-warning">Unsaved changes</span> : null}
              </div>

              <Form {...form}>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void save();
                  }}
                  className="relative min-h-0 flex-1 overflow-y-auto p-4"
                >
                  <div className="mx-auto max-w-3xl">
                    {section === "identity" ? <IdentitySection control={form.control} /> : null}
                    {section === "appearance" ? <AppearanceSection form={form} /> : null}
                    {section === "behaviour" ? <BehaviourSection control={form.control} options={options} /> : null}
                    {section === "model" ? <ModelSection control={form.control} options={options} /> : null}
                    {section === "leads" ? <LeadsSection control={form.control} /> : null}
                  </div>
                  <button type="submit" className="sr-only" tabIndex={-1}>
                    Save
                  </button>
                </form>
              </Form>
            </>
          ) : null}

          {tab === "knowledge" ? (
            <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
              <KnowledgePanel agent={agent} />
            </div>
          ) : null}

          {tab === "flow" ? <GuidedFlowPanel agent={agent} /> : null}

          {tab === "deploy" ? (
            <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mx-auto max-w-3xl">
                <DeployPanel agent={agent} />
              </div>
            </div>
          ) : null}
        </div>

        {showPreview ? (
          <aside className="hidden shrink-0 border-l border-border xl:block xl:w-[360px] 2xl:w-[440px]">
            <WidgetPreview values={values} agentId={agentId} />
          </aside>
        ) : null}
      </div>
    </AppShell>
  );
}

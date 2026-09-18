import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Bot, Copy, ExternalLink, MessageSquare, Settings2 } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { ChatAgentCard, ChatAgentCreateCard } from "@/components/chat-agents/agent-cards";
import { useCreateChatAgent } from "@/components/chat-agents/hook/mutation/use-chat-agent-mutations";
import {
  useGetAvailableChatAgents,
  type AvailableChatAgent,
} from "@/components/chat-agents/hook/query/use-get-available-chat-agents";
import { useGetChatAgents } from "@/components/chat-agents/hook/query/use-get-chat-agents";
import { PageHeader } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/axios-config";
import { Config } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/store/use-user-store";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({ meta: [{ title: `Chatbots — ${Config.APP_NAME}` }] }),
});

function HomePage() {
  const isAdmin = useIsAdmin();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isAdmin) void navigate({ to: "/chat", replace: true });
  }, [isAdmin, navigate]);
  return isAdmin ? <AdminGallery /> : null;
}

/** Every chatbot, drafts included, with create + configure. */
function AdminGallery() {
  const navigate = useNavigate();
  const { data: agents = [], isLoading, isError, error, refetch, isFetching } = useGetChatAgents();
  const createAgent = useCreateChatAgent();

  function handleCreate() {
    createAgent.mutate(
      { name: "Untitled chatbot" },
      { onSuccess: (agent) => void navigate({ to: "/agents/$agentId", params: { agentId: agent.id } }) },
    );
  }

  return (
    <AppShell noPadding>
      <PageHeader title="Chatbots" subtitle="Create, configure and share chatbots. Every conversation is recorded." />
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-border p-4">
        {isError ? (
          <ErrorState
            title="Couldn't load chatbots"
            description={getErrorMessage(error, "Please try again.")}
            onRetry={() => void refetch()}
            isRetrying={isFetching}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {isLoading
              ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)
              : agents.map((agent) => <ChatAgentCard key={agent.id} agent={agent} />)}
            {!isLoading ? <ChatAgentCreateCard onClick={handleCreate} isPending={createAgent.isPending} /> : null}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export function AvailableAgentCard({ agent, showConfigure }: { agent: AvailableChatAgent; showConfigure?: boolean }) {
  const shareUrl = `${window.location.origin}/s/${agent.publicKey}`;
  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-elev-1"
      style={{ borderTopColor: agent.theme.primary, borderTopWidth: 3 }}
    >
      <div className="flex items-start gap-3 p-4">
        <div
          className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl"
          style={{ background: agent.theme.primary, color: agent.theme.primaryText }}
        >
          {agent.avatarUrl ? (
            <img src={agent.avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <Bot className="size-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-semibold">{agent.name}</div>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {agent.heading || agent.greeting || "Ready to chat."}
          </p>
        </div>
      </div>
      <div className="mt-auto flex items-center gap-2 border-t border-border px-4 py-2.5">
        <Button asChild size="sm">
          <Link to="/chat/$publicKey" params={{ publicKey: agent.publicKey }}>
            <MessageSquare className="size-3.5" /> Start chat
          </Link>
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(shareUrl);
            toast.success("Share link copied");
          }}
        >
          <Copy className="size-3.5" /> Share link
        </Button>
        <a
          href={shareUrl}
          target="_blank"
          rel="noreferrer"
          className={cn("ml-auto text-muted-foreground hover:text-foreground")}
          title="Open share link"
        >
          <ExternalLink className="size-4" />
        </a>
        {showConfigure ? (
          <Link to="/agents/$agentId" params={{ agentId: agent.id }} className="text-muted-foreground hover:text-foreground">
            <Settings2 className="size-4" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

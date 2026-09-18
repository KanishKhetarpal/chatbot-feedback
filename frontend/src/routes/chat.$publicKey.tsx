import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { useGetAvailableChatAgents } from "@/components/chat-agents/hook/query/use-get-available-chat-agents";
import { WidgetChat } from "@/components/chat-agents/widget/widget-chat";
import { QUERY_KEYS } from "@/lib/query-keys";

/**
 * One chatbot's conversation, filling the right-hand pane. The bearer token
 * the widget attaches is what stamps the conversation with the signed-in
 * account. Keyed on the public key so switching bots remounts the panel
 * cleanly; every turn refreshes the list so its preview line follows.
 */
export const Route = createFileRoute("/chat/$publicKey")({
  component: ChatPanel,
});

function ChatPanel() {
  const { publicKey } = Route.useParams();
  const qc = useQueryClient();
  const { data: agents } = useGetAvailableChatAgents();
  const agent = agents?.find((a) => a.publicKey === publicKey);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-card px-1 md:hidden">
        <Link to="/chat" className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted" aria-label="All chats">
          <ChevronLeft className="size-5" />
        </Link>
        <span className="truncate text-sm font-medium">{agent?.name ?? "Chat"}</span>
      </div>
      <WidgetChat
        key={publicKey}
        agentKey={publicKey}
        variant="flush"
        startOnMessages
        className="h-full min-h-0 flex-1"
        onActivity={() => void qc.invalidateQueries({ queryKey: [QUERY_KEYS.GET_AVAILABLE_CHAT_AGENTS] })}
      />
    </div>
  );
}

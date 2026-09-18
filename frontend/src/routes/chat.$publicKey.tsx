import { createFileRoute } from "@tanstack/react-router";

import { WidgetChat } from "@/components/chat-agents/widget/widget-chat";

/**
 * One chatbot's conversation inside the chat workspace. The bearer token the
 * widget attaches is what stamps the conversation with the signed-in account.
 * Keyed on the public key so switching bots remounts the panel cleanly.
 */
export const Route = createFileRoute("/chat/$publicKey")({
  component: ChatPanel,
});

function ChatPanel() {
  const { publicKey } = Route.useParams();
  return (
    <div className="h-full w-full sm:h-[min(820px,100%)] sm:w-[460px]">
      <WidgetChat key={publicKey} agentKey={publicKey} variant="flush" className="h-full sm:rounded-3xl sm:shadow-elev-3" />
    </div>
  );
}

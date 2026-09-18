import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { MessageSquare } from "lucide-react";

import { useGetAvailableChatAgents } from "@/components/chat-agents/hook/query/use-get-available-chat-agents";

/** `/chat` with nothing picked: open the first live chatbot, or explain why there is none. */
export const Route = createFileRoute("/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const { data: agents, isLoading } = useGetAvailableChatAgents();
  const navigate = useNavigate();

  useEffect(() => {
    const first = agents?.[0];
    if (first) void navigate({ to: "/chat/$publicKey", params: { publicKey: first.publicKey }, replace: true });
  }, [agents, navigate]);

  return (
    <div className="grid h-full w-full place-items-center text-center">
      <div className="max-w-xs">
        <MessageSquare className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">{isLoading ? "Loading chatbots…" : "Pick a chatbot on the left"}</p>
        <p className="mt-1 text-xs text-muted-foreground">Each chatbot keeps its own conversation. Rate replies as you go.</p>
      </div>
    </div>
  );
}

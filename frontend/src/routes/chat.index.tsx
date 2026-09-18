import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";

import { useGetAvailableChatAgents } from "@/components/chat-agents/hook/query/use-get-available-chat-agents";

/** `/chat` with nothing picked: the empty right-hand pane (on a phone the list is what shows). */
export const Route = createFileRoute("/chat/")({
  component: ChatIndex,
});

function ChatIndex() {
  const { data: agents, isLoading } = useGetAvailableChatAgents();
  const none = !isLoading && (agents?.length ?? 0) === 0;
  return (
    <div className="grid h-full w-full place-items-center p-6 text-center">
      <div className="max-w-xs">
        <div className="mx-auto grid size-16 place-items-center rounded-full bg-card shadow-elev-1">
          <MessagesSquare className="size-7 text-muted-foreground" />
        </div>
        <p className="mt-4 text-base font-medium">
          {isLoading ? "Loading chatbots…" : none ? "No chatbots are live yet" : "Select a chat to start messaging"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {none
            ? "An admin needs to activate one from the Chatbots page."
            : "Each chatbot keeps its own conversation. Use the ⋯ under any reply to like it, dislike it or leave a note."}
        </p>
      </div>
    </div>
  );
}

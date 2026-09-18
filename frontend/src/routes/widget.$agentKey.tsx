import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { WidgetChat } from "@/components/chat-agents/widget/widget-chat";

/**
 * The chat panel as an embedded iframe sees it. The embed loader
 * (`/widget.js`) draws a launcher on another site and mounts this page when
 * someone clicks it. `$agentKey` is the chatbot's public key.
 */
export const Route = createFileRoute("/widget/$agentKey")({
  component: PublicWidget,
});

function PublicWidget() {
  const { agentKey } = Route.useParams();

  useEffect(() => {
    if (window.parent === window) return;
    window.parent.postMessage({ source: "acharya-chat-widget", type: "ready" }, "*");
  }, []);

  return (
    <div className="flex h-svh w-full items-end justify-end bg-transparent">
      <aside className="h-full w-full overflow-hidden">
        <WidgetChat agentKey={agentKey} variant="flush" />
      </aside>
    </div>
  );
}

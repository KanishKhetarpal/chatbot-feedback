import { createFileRoute } from "@tanstack/react-router";

import { WidgetChat } from "@/components/chat-agents/widget/widget-chat";
import { Config } from "@/lib/config";

/**
 * The share link. `/s/<publicKey>` is what an admin sends to people for
 * feedback — no account needed. The chat fills the page on a phone and sits in
 * a card on a desktop.
 */
export const Route = createFileRoute("/s/$publicKey")({
  component: SharePage,
  head: () => ({ meta: [{ title: `Chat — ${Config.APP_NAME}` }] }),
});

function SharePage() {
  const { publicKey } = Route.useParams();
  return (
    <div className="flex min-h-svh w-full items-stretch justify-center bg-muted/40 sm:items-center sm:p-6">
      <div className="h-svh w-full sm:h-[min(820px,calc(100svh-3rem))] sm:w-[420px]">
        <WidgetChat agentKey={publicKey} variant="flush" className="h-full sm:rounded-3xl sm:shadow-elev-3" />
      </div>
    </div>
  );
}

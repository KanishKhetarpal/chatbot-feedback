import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { InboxView } from "@/components/chat-agents/inbox-view";
import { ErrorState } from "@/components/ui/empty-state";
import { Config } from "@/lib/config";
import { useIsAdmin } from "@/store/use-user-store";

export const Route = createFileRoute("/conversations")({
  component: ConversationsPage,
  head: () => ({ meta: [{ title: `Conversations — ${Config.APP_NAME}` }] }),
});

function ConversationsPage() {
  const isAdmin = useIsAdmin();
  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      {isAdmin ? (
        <InboxView />
      ) : (
        <div className="p-4">
          <ErrorState title="Admins only" description="Reviewing conversations needs an admin account." />
        </div>
      )}
    </AppShell>
  );
}

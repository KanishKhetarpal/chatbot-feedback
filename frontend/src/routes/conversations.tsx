import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { InboxView } from "@/components/chat-agents/inbox-view";
import { ErrorState } from "@/components/ui/empty-state";
import { Config } from "@/lib/config";
import { useIsAdmin } from "@/store/use-user-store";

/** `?visitorId=` opens straight on one conversation — what the Feedback page links to. */
export const Route = createFileRoute("/conversations")({
  component: ConversationsPage,
  validateSearch: (search: Record<string, unknown>): { visitorId?: string } =>
    typeof search.visitorId === "string" && search.visitorId ? { visitorId: search.visitorId } : {},
  head: () => ({ meta: [{ title: `Conversations — ${Config.APP_NAME}` }] }),
});

function ConversationsPage() {
  const isAdmin = useIsAdmin();
  const { visitorId } = Route.useSearch();
  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      {isAdmin ? (
        <InboxView key={visitorId ?? "all"} initialVisitorId={visitorId} />
      ) : (
        <div className="p-4">
          <ErrorState title="Admins only" description="Reviewing conversations needs an admin account." />
        </div>
      )}
    </AppShell>
  );
}

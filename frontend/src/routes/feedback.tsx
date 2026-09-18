import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { FeedbackView } from "@/components/chat-agents/feedback-view";
import { ErrorState } from "@/components/ui/empty-state";
import { Config } from "@/lib/config";
import { useIsAdmin } from "@/store/use-user-store";

export const Route = createFileRoute("/feedback")({
  component: FeedbackPage,
  head: () => ({ meta: [{ title: `Feedback — ${Config.APP_NAME}` }] }),
});

function FeedbackPage() {
  const isAdmin = useIsAdmin();
  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      {isAdmin ? (
        <FeedbackView />
      ) : (
        <div className="p-4">
          <ErrorState title="Admins only" description="Feedback analysis needs an admin account." />
        </div>
      )}
    </AppShell>
  );
}

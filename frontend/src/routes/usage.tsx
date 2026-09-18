import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { UsageView } from "@/components/chat-agents/usage-view";
import { ErrorState } from "@/components/ui/empty-state";
import { Config } from "@/lib/config";
import { useIsAdmin } from "@/store/use-user-store";

export const Route = createFileRoute("/usage")({
  component: UsagePage,
  head: () => ({ meta: [{ title: `Token usage — ${Config.APP_NAME}` }] }),
});

function UsagePage() {
  const isAdmin = useIsAdmin();
  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      {isAdmin ? (
        <UsageView />
      ) : (
        <div className="p-4">
          <ErrorState title="Admins only" description="Token usage needs an admin account." />
        </div>
      )}
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell";
import { WhatsappView } from "@/components/whatsapp/whatsapp-view";
import { ErrorState } from "@/components/ui/empty-state";
import { Config } from "@/lib/config";
import { useIsAdmin } from "@/store/use-user-store";

export const Route = createFileRoute("/whatsapp")({
  component: WhatsappPage,
  head: () => ({ meta: [{ title: `WhatsApp — ${Config.APP_NAME}` }] }),
});

function WhatsappPage() {
  const isAdmin = useIsAdmin();
  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      {isAdmin ? (
        <WhatsappView />
      ) : (
        <div className="p-4">
          <ErrorState title="Admins only" description="The WhatsApp channel needs an admin account." />
        </div>
      )}
    </AppShell>
  );
}

import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { Bot, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { useGetAvailableChatAgents } from "@/components/chat-agents/hook/query/use-get-available-chat-agents";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/axios-config";
import { Config } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/store/use-user-store";

/**
 * The chat workspace: every live chatbot down the left, the selected one's
 * conversation on the right. Switching bots keeps each conversation where it
 * was — the widget stores a visitor token per chatbot.
 */
export const Route = createFileRoute("/chat")({
  component: ChatLayout,
  head: () => ({ meta: [{ title: `Chat — ${Config.APP_NAME}` }] }),
});

function ChatLayout() {
  const { data: agents = [], isLoading, isError, error } = useGetAvailableChatAgents();
  const isAdmin = useIsAdmin();
  const params = useParams({ strict: false }) as { publicKey?: string };
  const activeKey = params.publicKey;

  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card/40">
          <div className="border-b border-border px-3 py-2.5">
            <p className="text-xs font-semibold tracking-tight">Chatbots</p>
            <p className="text-[11px] text-muted-foreground">
              {isLoading ? "Loading…" : `${agents.length} live`}
            </p>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">{getErrorMessage(error, "Could not load chatbots")}</p>
            ) : agents.length === 0 ? (
              <p className="px-2 py-3 text-xs text-muted-foreground">
                No chatbots are live yet.{isAdmin ? " Activate one from the Chatbots page." : " Ask an admin to activate one."}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {agents.map((agent) => {
                  const active = agent.publicKey === activeKey;
                  return (
                    <li key={agent.id}>
                      <Link
                        to="/chat/$publicKey"
                        params={{ publicKey: agent.publicKey }}
                        className={cn(
                          "flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                          active ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <span
                          className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg"
                          style={{ background: agent.theme.primary, color: agent.theme.primaryText }}
                        >
                          {agent.avatarUrl ? (
                            <img src={agent.avatarUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <Bot className="size-4" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{agent.name}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {agent.subheading || agent.heading || "Tap to chat"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>
          {activeKey ? (
            <div className="border-t border-border p-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard.writeText(`${window.location.origin}/s/${activeKey}`);
                    toast.success("Share link copied");
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Copy className="size-3.5" /> Copy share link
                </button>
                <a
                  href={`/s/${activeKey}`}
                  target="_blank"
                  rel="noreferrer"
                  className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Open share link"
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </div>
            </div>
          ) : null}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 items-stretch justify-center bg-muted/40 p-0 sm:p-6">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}

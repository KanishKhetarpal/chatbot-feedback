import { useMemo, useState } from "react";
import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { Bot, Copy, ExternalLink, RotateCcw, Search, Star } from "lucide-react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import {
  useGetAvailableChatAgents,
  type AvailableChatAgent,
} from "@/components/chat-agents/hook/query/use-get-available-chat-agents";
import { Skeleton } from "@/components/ui/skeleton";
import { getErrorMessage } from "@/lib/axios-config";
import { Config } from "@/lib/config";
import { cn } from "@/lib/utils";
import { requestNewWidgetChat } from "@/lib/widget-api";
import { useIsAdmin } from "@/store/use-user-store";

/**
 * The chat workspace, laid out like a messaging app: every live chatbot is a
 * "contact" in the list on the left, with the last thing said and when; the
 * selected one's conversation fills the right. Each chatbot keeps its own
 * thread — the widget stores a visitor token per chatbot.
 *
 * On a phone it is one pane at a time: the list, or the conversation with a
 * back arrow.
 */
export const Route = createFileRoute("/chat")({
  component: ChatLayout,
  head: () => ({ meta: [{ title: `Chat — ${Config.APP_NAME}` }] }),
});

function timeLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  if (now.getTime() - d.getTime() < 6 * 86_400_000) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function previewOf(agent: AvailableChatAgent) {
  const last = agent.myThread?.lastMessage;
  if (last) return `${last.role === "user" ? "You: " : ""}${last.preview.replace(/\s+/g, " ")}`;
  return agent.subheading || agent.heading || agent.greeting || "Tap to start chatting";
}

function ChatLayout() {
  const { data: agents = [], isLoading, isError, error } = useGetAvailableChatAgents();
  const isAdmin = useIsAdmin();
  const params = useParams({ strict: false }) as { publicKey?: string };
  const activeKey = params.publicKey;
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? agents.filter((a) =>
          [a.name, a.heading, a.subheading, a.myThread?.lastMessage?.preview].some((s) => s?.toLowerCase().includes(q)),
        )
      : agents;
    // Conversations you have had float to the top, newest first — everyone else alphabetical.
    return [...filtered].sort((a, b) => {
      const ta = a.myThread?.lastMessage?.at ?? "";
      const tb = b.myThread?.lastMessage?.at ?? "";
      if (ta && tb) return ta < tb ? 1 : -1;
      if (ta) return -1;
      if (tb) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [agents, search]);

  return (
    <AppShell noPadding className="h-screen overflow-hidden">
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "flex w-full shrink-0 flex-col border-r border-border bg-card md:w-[340px]",
            activeKey && "hidden md:flex",
          )}
        >
          <div className="flex h-14 items-center justify-between border-b border-border px-4">
            <div>
              <p className="font-display text-base font-bold tracking-tight">Chats</p>
              <p className="text-[11px] text-muted-foreground">
                {isLoading ? "Loading…" : `${agents.length} chatbot${agents.length === 1 ? "" : "s"} live`}
              </p>
            </div>
          </div>

          <div className="px-3 py-2">
            <label className="flex h-9 items-center gap-2 rounded-lg bg-muted px-3 text-sm text-muted-foreground">
              <Search className="size-4 shrink-0" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chatbots"
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="space-y-1 p-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 rounded-xl" />
                ))}
              </div>
            ) : isError ? (
              <p className="px-4 py-6 text-xs text-muted-foreground">{getErrorMessage(error, "Could not load chatbots")}</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                {agents.length === 0
                  ? isAdmin
                    ? "No chatbots are live yet. Activate one from the Chatbots page."
                    : "No chatbots are live yet. Ask an admin to activate one."
                  : "No chatbot matches that search."}
              </p>
            ) : (
              <ul>
                {rows.map((agent) => {
                  const active = agent.publicKey === activeKey;
                  const last = agent.myThread?.lastMessage;
                  return (
                    <li key={agent.id}>
                      <Link
                        to="/chat/$publicKey"
                        params={{ publicKey: agent.publicKey }}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 transition-colors",
                          active ? "bg-muted" : "hover:bg-muted/60",
                        )}
                      >
                        <span
                          className="relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-full"
                          style={{ background: agent.theme.primary, color: agent.theme.primaryText }}
                        >
                          {agent.avatarUrl ? (
                            <img src={agent.avatarUrl} alt="" className="size-full object-cover" />
                          ) : (
                            <Bot className="size-5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 border-b border-border/60 pb-2.5">
                          <span className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[15px] font-medium">{agent.name}</span>
                            {last ? (
                              <span className={cn("shrink-0 text-[11px]", active ? "text-foreground/70" : "text-muted-foreground")}>
                                {timeLabel(last.at)}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5">
                            {agent.myThread?.rating ? (
                              <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" aria-label={`Rated ${agent.myThread.rating}/5`} />
                            ) : null}
                            <span className="truncate text-[13px] text-muted-foreground">{previewOf(agent)}</span>
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
                <button
                  type="button"
                  onClick={() => {
                    requestNewWidgetChat(activeKey);
                    toast.success("Started a fresh chat");
                  }}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  title="Start this chatbot's conversation again from fresh. The old one stays in Conversations."
                >
                  <RotateCcw className="size-3.5" /> New chat
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

        <div
          className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col bg-muted/50", !activeKey && "hidden md:flex")}
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, color-mix(in srgb, currentColor 7%, transparent) 1px, transparent 0)",
            backgroundSize: "18px 18px",
          }}
        >
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}

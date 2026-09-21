import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Plus } from "lucide-react";

import { ChatAgentActionsMenu } from "@/components/chat-agents/delete-agent";
import { Badge } from "@/components/ui-kit";
import { getChatAgentStatusTone } from "@/lib/chat-agent-constants";
import { cn } from "@/lib/utils";
import { capitalizeWords, getRelativeTime } from "@/lib/utils";
import type { ChatAgent } from "@/types/chat-agent-types";

/**
 * Square avatar for a chatbot, falling back to its initial.
 *
 * Not the shadcn `Avatar`: that one is round and reads as a person, and these
 * are software. A rounded square keeps the two apart at a glance in a CRM where
 * "agent" already means a human being elsewhere.
 */
export function ChatAgentAvatar({
  name,
  avatarUrl,
  size = "md",
  className,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden border border-border bg-gradient-to-br from-muted to-background font-semibold text-foreground/80",
        size === "sm" && "size-8 rounded-lg text-xs",
        size === "md" && "size-10 rounded-xl text-sm",
        size === "lg" && "size-12 rounded-2xl text-base",
        className,
      )}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-full object-cover" />
      ) : initial ? (
        <span>{initial}</span>
      ) : (
        <Bot className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

export function ChatAgentStatusBadge({ status }: { status: string }) {
  return <Badge tone={getChatAgentStatusTone(status)}>{capitalizeWords(status)}</Badge>;
}

export function ChatAgentCard({ agent }: { agent: ChatAgent }) {
  const sources = agent.knowledgeSources?.length ?? 0;
  const displayName = agent.name || "Untitled chatbot";
  const subtitle =
    agent.heading && agent.heading.toLowerCase() !== displayName.toLowerCase()
      ? agent.heading
      : null;

  return (
    <div className="relative h-full">
    <Link
      to="/agents/$agentId"
      params={{ agentId: agent.id }}
      className="group flex h-full min-h-52 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-elev-1 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-elev-2 focus-visible:border-primary/50 focus-visible:outline-none"
    >
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <ChatAgentAvatar name={displayName} avatarUrl={agent.avatarUrl} size="lg" />
          <span className="mr-8">
            <ChatAgentStatusBadge status={agent.status} />
          </span>
        </div>

        <div className="mt-3 flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight">
            {displayName}
          </h3>
          <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary group-hover:opacity-100" />
        </div>

        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}

        <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
          {agent.description || "No internal description yet."}
        </p>
      </div>

      <dl className="mt-auto grid grid-cols-3 divide-x divide-border border-t border-border bg-muted/40">
        <MetaCell label="Sources" value={String(sources)} />
        <MetaCell label="Mode" value={capitalizeWords(agent.knowledgeMode)} />
        <MetaCell label="Updated" value={getRelativeTime(agent.updatedAt) || "—"} />
      </dl>
    </Link>
    {/* Outside the link, so opening the menu doesn't open the chatbot. */}
    <ChatAgentActionsMenu agent={agent} className="absolute top-3 right-2 size-8 text-muted-foreground" />
    </div>
  );
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-3 py-2">
      <dt className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-xs font-medium">{value}</dd>
    </div>
  );
}

/** The "add" tile that sits at the end of the grid. */
export function ChatAgentCreateCard({
  onClick,
  isPending,
}: {
  onClick: () => void;
  isPending: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="flex min-h-52 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 px-6 py-8 text-center transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/5 disabled:pointer-events-none disabled:opacity-60"
    >
      <span className="grid size-11 place-items-center rounded-2xl bg-primary/12 text-primary ring-1 ring-primary/20">
        <Plus className="size-5" strokeWidth={2.25} />
      </span>
      <div>
        <p className="text-sm font-medium">{isPending ? "Creating…" : "Create a new chatbot"}</p>
        <p className="mt-1 max-w-56 text-xs leading-relaxed text-muted-foreground">
          Profile, knowledge, then deploy — ready in a few minutes.
        </p>
      </div>
    </button>
  );
}

import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Loader2, MoreVertical, Pause, Play, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useDeleteChatAgent, useUpdateChatAgent } from "@/components/chat-agents/hook/mutation/use-chat-agent-mutations";
import { getErrorMessage } from "@/lib/axios-config";
import { SectionHeading } from "@/components/chat-agents/profile-sections";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ChatAgent } from "@/types/chat-agent-types";

/**
 * Everything that deletes a chat agent, in one file: the confirmation itself,
 * the header menu that opens it, and the Deploy tab's danger zone.
 *
 * Kept together because the wording is the load-bearing part. An author needs
 * to read the same list of consequences wherever they start from, and three
 * files drift into three slightly different accounts of what is about to be
 * destroyed.
 */

/** Why a live agent is never offered the delete, in both entry points. */
const LIVE_HINT =
  "This chatbot is live on a website. Set its status to Paused on the Deploy tab and save, then delete — so the widget stops serving before its knowledge disappears.";

/**
 * Confirm and delete. Controlled — the trigger lives with the caller.
 *
 * Type-to-confirm rather than a plain "Are you sure?", matching the lead hard
 * delete. The friction is not the point: typing the name is what makes it
 * impossible to destroy the wrong agent from muscle memory on a screen where
 * every chatbot looks identical.
 *
 * Owns the mutation and the redirect so both entry points behave the same. The
 * knowledge count comes off the chatbot rather than from `useGetKnowledgeSources`:
 * that hook polls every two seconds while a source is ingesting, and mounting it
 * here would run that poll on every tab just to keep one number in a closed
 * dialog up to date.
 */
export function DeleteChatAgentDialog({
  agent,
  open,
  onOpenChange,
}: {
  agent: ChatAgent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const deleteAgent = useDeleteChatAgent();
  const pauseAgent = useUpdateChatAgent(agent.id);
  const [confirmText, setConfirmText] = useState("");

  const name = agent.name || "Untitled chatbot";
  const isDeleting = deleteAgent.isPending || pauseAgent.isPending;
  const confirmMatches = confirmText.trim() === name;
  const sourceCount = agent.knowledgeSources?.length ?? 0;

  function handleOpenChange(nextOpen: boolean) {
    // No dismissing a delete that is already in flight — the outcome is decided
    // by the server either way, and closing here would strand the toast.
    if (isDeleting) return;
    onOpenChange(nextOpen);
    if (!nextOpen) setConfirmText("");
  }

  async function handleDelete() {
    if (!confirmMatches) return;
    // The server only deletes a paused chatbot, so a live one is paused first.
    if (agent.status === "active") {
      try {
        await pauseAgent.mutateAsync({ status: "paused" });
      } catch (error) {
        toast.error(getErrorMessage(error, "Could not pause this chatbot"));
        return;
      }
    }
    deleteAgent.mutate(agent.id, {
      onSuccess: () => {
        onOpenChange(false);
        void navigate({ to: "/" });
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Permanently delete this chatbot?
          </DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">This will delete:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
              <li>The chatbot and its embed key — any site running the widget will break</li>
              <li>
                {sourceCount} knowledge {sourceCount === 1 ? "source" : "sources"}, including
                uploaded files, and every trained knowledge pack
              </li>
              <li>Every widget conversation — visitors and their messages, in the Inbox</li>
            </ul>
          </div>
          <p className="text-muted-foreground">
            Leads already captured from this chatbot are not affected.{" "}
            <span className="font-medium text-destructive">This cannot be undone.</span>
          </p>
          <div className="grid gap-2">
            <Label htmlFor="delete-agent-confirm">
              Type the chatbot&apos;s name ({name}) to confirm
            </Label>
            <Input
              id="delete-agent-confirm"
              autoComplete="off"
              placeholder={name}
              value={confirmText}
              onChange={(event) => setConfirmText(event.target.value)}
              disabled={isDeleting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!confirmMatches || isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-1.5 size-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete forever"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The chatbot header's overflow menu — the delete that is reachable from every
 * tab, rather than only from the one the danger zone happens to sit on.
 *
 * On a live agent the item stays visible but disabled, with the reason beneath
 * it. Hiding it instead would read as "this chatbot cannot be deleted", which is
 * not true and leaves the author with nowhere to go.
 */
export function ChatAgentActionsMenu({ agent, className }: { agent: ChatAgent; className?: string }) {
  const [open, setOpen] = useState(false);
  const update = useUpdateChatAgent(agent.id);
  const isLive = agent.status === "active";

  function setStatus(status: "active" | "paused") {
    update.mutate(
      { status },
      {
        onSuccess: () => toast.success(status === "active" ? `"${agent.name}" is live` : `"${agent.name}" is paused`),
        onError: (error) => toast.error(getErrorMessage(error, "Could not change the status")),
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Chatbot actions"
            className={className ?? "size-8 text-muted-foreground"}
            disabled={update.isPending}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {isLive ? (
            <DropdownMenuItem onSelect={() => setStatus("paused")}>
              <Pause className="mr-2 size-4" />
              Pause
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setStatus("active")}>
              <Play className="mr-2 size-4" />
              Activate
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => setOpen(true)} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 size-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DeleteChatAgentDialog agent={agent} open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * The Deploy tab's danger zone — the same delete, said in full.
 *
 * The menu item is the shortcut for someone who already knows; this is where an
 * author who does not finds out what deleting a chatbot actually costs.
 */
export function ChatAgentDangerZone({ agent }: { agent: ChatAgent }) {
  const [open, setOpen] = useState(false);
  const isLive = agent.status === "active";

  return (
    <>
      <section className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4">
        <SectionHeading
          title="Delete this chatbot"
          hint="Removes the chatbot, its entire knowledge base and every widget conversation. This cannot be undone."
        />
        {isLive ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
            {LIVE_HINT}
          </p>
        ) : null}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={isLive}
          onClick={() => setOpen(true)}
        >
          <Trash2 className="size-3.5" />
          Delete chatbot
        </Button>
      </section>

      <DeleteChatAgentDialog agent={agent} open={open} onOpenChange={setOpen} />
    </>
  );
}

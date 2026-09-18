/**
 * The pieces a tree is edited with: one node's fields, the picker that adds a
 * next chip, a sortable root row, and the issue list. Layout and navigation
 * live in `index.tsx`; every change goes through the controller.
 */

import { useState, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertTriangle,
  ArrowRight,
  Brain,
  ChevronDown,
  CornerDownRight,
  Globe,
  GripVertical,
  MapPin,
  Plus,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { GuidedFlowController } from "@/components/chat-agents/hook/controller/use-guided-flow-controller";
import { Badge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  GUIDED_FLOW_LIMITS,
  GUIDED_FLOW_MERGE_TOKENS,
  GUIDED_FLOW_SYSTEM_CHIPS,
  isGuidedFlowReservedId,
  resolveGuidedChipLabel,
} from "@/lib/chat-agent-constants";
import { cn } from "@/lib/utils";
import type {
  GuidedFlow,
  GuidedFlowIssue,
  GuidedFlowNode,
  GuidedFlowReservedId,
} from "@/types/chat-agent-types";

const SYSTEM_CHIP_ICONS: Record<GuidedFlowReservedId, LucideIcon> = {
  escape_ai: Brain,
  escape_human: UserRound,
  mark_intl_yes: Globe,
  mark_intl_no: MapPin,
};

/** The glyph for a system chip, so the editor and picker draw the same one. */
export function SystemChipIcon({
  id,
  className,
}: {
  id: GuidedFlowReservedId;
  className?: string;
}) {
  const Icon = SYSTEM_CHIP_ICONS[id];
  return <Icon className={className} />;
}

/* ── Issues ─────────────────────────────────────────────────────────────── */

export function IssueList({ issues, compact }: { issues: GuidedFlowIssue[]; compact?: boolean }) {
  if (!issues.length) return null;
  return (
    <ul
      className={cn(
        "space-y-1 rounded-lg border border-danger/30 bg-danger/5 text-danger",
        compact ? "px-2.5 py-2 text-[11px]" : "px-3 py-2.5 text-xs",
      )}
    >
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${issue.where ?? ""}-${index}`} className="flex gap-1.5">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
          <span>
            {issue.message}
            {!compact && issue.where ? (
              <span className="ml-1 font-mono text-[10px] opacity-70">{issue.where}</span>
            ) : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ── Chip picker ────────────────────────────────────────────────────────── */

/**
 * "Add next chip" / "Add root chip". Offers the four system chips, every
 * existing node not already linked, and — when the search matches nothing
 * exactly — a "create" row that makes a blank node with that label.
 */
export function ChipPicker({
  flow,
  exclude,
  allowSystem = true,
  disabled,
  onPick,
  onCreate,
  children,
}: {
  flow: GuidedFlow;
  /** Ids that must not be offered: the node itself and whatever it already links to. */
  exclude: string[];
  allowSystem?: boolean;
  disabled?: boolean;
  onPick: (id: string) => void;
  onCreate: (label: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const excluded = new Set(exclude);
  const trimmed = query.trim();

  const nodes = Object.values(flow.nodes).filter((node) => !excluded.has(node.id));
  const systems = allowSystem
    ? GUIDED_FLOW_SYSTEM_CHIPS.filter((chip) => !excluded.has(chip.id))
    : [];
  const exactExists =
    trimmed.length > 0 &&
    Object.values(flow.nodes).some((n) => n.label.trim().toLowerCase() === trimmed.toLowerCase());
  const canCreate =
    trimmed.length > 0 &&
    trimmed.length <= GUIDED_FLOW_LIMITS.maxLabel &&
    !exactExists &&
    Object.keys(flow.nodes).length < GUIDED_FLOW_LIMITS.maxNodes;

  function close() {
    setOpen(false);
    setQuery("");
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {children}
      </PopoverTrigger>
      <PopoverContent className="w-[320px] p-0" align="start">
        <Command>
          <CommandInput
            placeholder="Search nodes, or type a new chip…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            {systems.length ? (
              <CommandGroup heading="System chips">
                {systems.map((chip) => {
                  const Icon = SYSTEM_CHIP_ICONS[chip.id];
                  return (
                    <CommandItem
                      key={chip.id}
                      value={`${chip.id} ${resolveGuidedChipLabel(flow, chip.id)}`}
                      onSelect={() => {
                        onPick(chip.id);
                        close();
                      }}
                    >
                      <Icon className="size-3.5 text-primary" />
                      <span className="min-w-0 flex-1 truncate">
                        {resolveGuidedChipLabel(flow, chip.id)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{chip.hint}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}
            {nodes.length ? (
              <CommandGroup heading="Existing nodes">
                {nodes.map((node) => (
                  <CommandItem
                    key={node.id}
                    value={`${node.id} ${node.label}`}
                    onSelect={() => {
                      onPick(node.id);
                      close();
                    }}
                  >
                    <CornerDownRight className="size-3.5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{node.label || node.id}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">{node.id}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {canCreate ? (
              <CommandGroup heading="New">
                <CommandItem
                  value={`__create__ ${trimmed}`}
                  onSelect={() => {
                    onCreate(trimmed);
                    close();
                  }}
                >
                  <Plus className="size-3.5" />
                  Create “{trimmed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ── Next chips ─────────────────────────────────────────────────────────── */

/** A chip as it appears in a node's Next list: click to drill in, × to unlink. */
function NextChip({
  flow,
  id,
  onEnter,
  onRemove,
}: {
  flow: GuidedFlow;
  id: string;
  onEnter: () => void;
  onRemove: () => void;
}) {
  const reserved = isGuidedFlowReservedId(id);
  const missing = !reserved && !flow.nodes[id];
  const Icon = reserved ? SYSTEM_CHIP_ICONS[id] : null;

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border pl-2.5 text-xs",
        reserved
          ? "border-primary/30 bg-primary/8 text-primary"
          : missing
            ? "border-danger/40 bg-danger/5 text-danger"
            : "border-border bg-muted/60 hover:bg-muted",
      )}
    >
      {Icon ? <Icon className="size-3 shrink-0" /> : null}
      <button
        type="button"
        onClick={onEnter}
        disabled={reserved || missing}
        className="min-w-0 truncate py-1 text-left disabled:cursor-default"
        title={reserved ? "System chip" : missing ? "Node not found" : "Open this node"}
      >
        {resolveGuidedChipLabel(flow, id)}
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="grid size-6 place-items-center rounded-full text-muted-foreground hover:text-foreground"
        aria-label="Remove chip"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/* ── Node fields ────────────────────────────────────────────────────────── */

/**
 * Label, answer and the next chips of one node. Shared by the expanded root
 * row and the drilled-in editor so both places behave identically.
 */
export function NodeFields({
  flow,
  node,
  controller,
  showLabel = true,
}: {
  flow: GuidedFlow;
  node: GuidedFlowNode;
  controller: GuidedFlowController;
  showLabel?: boolean;
}) {
  const answerOver = node.answer.length > GUIDED_FLOW_LIMITS.maxAnswer;
  const nextFull = node.next.length >= GUIDED_FLOW_LIMITS.maxNext;

  function insertToken(token: string) {
    const snippet = token === "firstName" ? `{{${token}|there}}` : `{{${token}}}`;
    const joiner = node.answer && !/\s$/.test(node.answer) ? " " : "";
    controller.updateNode(node.id, { answer: `${node.answer}${joiner}${snippet}` });
  }

  return (
    <div className="space-y-4">
      {showLabel ? (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Chip label</label>
          <Input
            value={node.label}
            maxLength={GUIDED_FLOW_LIMITS.maxLabel}
            onChange={(event) => controller.updateNode(node.id, { label: event.target.value })}
            placeholder="What programmes do you offer?"
          />
          <p className="font-mono text-[10px] text-muted-foreground">id: {node.id}</p>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label className="text-xs font-medium text-muted-foreground">Answer</label>
          <span
            className={cn(
              "text-[10px] tabular-nums",
              answerOver ? "text-danger" : "text-muted-foreground",
            )}
          >
            {node.answer.length} / {GUIDED_FLOW_LIMITS.maxAnswer}
          </span>
        </div>
        <Textarea
          value={node.answer}
          rows={4}
          onChange={(event) => controller.updateNode(node.id, { answer: event.target.value })}
          placeholder="We offer B.Tech, MBA and 20+ more. Which area interests you, {{firstName|there}}?"
          className={cn(answerOver && "border-danger")}
        />
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-[10px] text-muted-foreground">Insert:</span>
          {GUIDED_FLOW_MERGE_TOKENS.map((token) => (
            <Tooltip key={token.token}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => insertToken(token.token)}
                  className="rounded border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
                >
                  {token.token}
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {token.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label className="text-xs font-medium text-muted-foreground">Next chips</label>
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {node.next.length} / {GUIDED_FLOW_LIMITS.maxNext}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {node.next.map((id) => (
            <NextChip
              key={id}
              flow={flow}
              id={id}
              onEnter={() => controller.enter(id)}
              onRemove={() => controller.removeNext(node.id, id)}
            />
          ))}
          <ChipPicker
            flow={flow}
            exclude={[node.id, ...node.next]}
            disabled={nextFull}
            onPick={(id) => controller.addNext(node.id, { existingId: id })}
            onCreate={(label) => controller.addNext(node.id, { label })}
          >
            <Button type="button" variant="dashed" size="xs" disabled={nextFull}>
              <Plus className="size-3" />
              Add next chip
            </Button>
          </ChipPicker>
        </div>
        {!node.next.length ? (
          <p className="text-[11px] text-muted-foreground">
            No chips after this answer — the visitor is left with nothing to press. Add at least an
            “ask the AI” or “talk to a counsellor” chip.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/* ── Root row ───────────────────────────────────────────────────────────── */

/** One root chip: a drag handle, the label, and the node's fields when open. */
export function RootRow({
  flow,
  id,
  index,
  controller,
  onDelete,
}: {
  flow: GuidedFlow;
  id: string;
  index: number;
  controller: GuidedFlowController;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const node = flow.nodes[id];
  const reserved = isGuidedFlowReservedId(id);
  const issues = controller.issuesFor(id);
  const Icon = reserved ? SYSTEM_CHIP_ICONS[id] : null;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-xl border border-border bg-card",
        isDragging && "z-10 shadow-elev-2 opacity-90",
        issues.length && "border-danger/40",
      )}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
          aria-label="Drag to reorder"
        >
          <GripVertical className="size-4" />
        </button>
        <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
          {index + 1}.
        </span>
        {Icon ? <Icon className="size-3.5 shrink-0 text-primary" /> : null}
        <button
          type="button"
          onClick={() => !reserved && setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          disabled={reserved}
        >
          <span
            className={cn(
              "truncate text-sm",
              !node?.label && !reserved && "italic text-muted-foreground",
            )}
          >
            {resolveGuidedChipLabel(flow, id) || "Untitled chip"}
          </span>
          {reserved ? <Badge tone="primary-light">System</Badge> : null}
          {!reserved && node ? (
            <span className="shrink-0 text-[10px] text-muted-foreground">
              {node.next.length} next
            </span>
          ) : null}
          {issues.length ? <Badge tone="danger-light">{issues.length}</Badge> : null}
        </button>
        {!reserved && node ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => controller.enter(id)}
            title="Open this node"
          >
            <ArrowRight className="size-3.5" />
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onDelete}
          className="text-muted-foreground hover:text-danger"
          aria-label="Remove root chip"
        >
          <Trash2 className="size-3.5" />
        </Button>
        {!reserved ? (
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              open ? "rotate-0" : "-rotate-90",
            )}
          />
        ) : null}
      </div>
      {open && node ? (
        <div className="space-y-3 border-t border-border px-4 py-4">
          <IssueList issues={issues} compact />
          <NodeFields flow={flow} node={node} controller={controller} />
        </div>
      ) : null}
    </li>
  );
}

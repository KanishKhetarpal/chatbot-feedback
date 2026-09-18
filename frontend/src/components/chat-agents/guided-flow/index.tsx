/**
 * The Flow tab: an accordion editor for the guided chip tree, with a live
 * simulation beside it.
 *
 * Deliberately not a canvas. The server caps depth at five and roots at eight,
 * which is a list of lists, and an accordion with breadcrumbs shows that
 * without the pan-and-zoom a node graph would need. Every edit is local until
 * Save sends the whole tree in one PUT — there is no per-node endpoint and no
 * partial save, so "unsaved" here means all of it.
 */

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ChevronRight, Home, ListTree, Plus, Trash2, Unlink } from "lucide-react";
import { toast } from "sonner";

import {
  ChipPicker,
  IssueList,
  NodeFields,
  RootRow,
  SystemChipIcon,
} from "@/components/chat-agents/guided-flow/flow-nodes";
import { GuidedFlowPreview } from "@/components/chat-agents/guided-flow/flow-preview";
import {
  useGuidedFlowController,
  type GuidedFlowController,
  type GuidedFlowLabels,
} from "@/components/chat-agents/hook/controller/use-guided-flow-controller";
import { SectionHeading } from "@/components/chat-agents/profile-sections";
import { Badge } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GUIDED_FLOW_LIMITS, GUIDED_FLOW_SYSTEM_CHIPS } from "@/lib/chat-agent-constants";
import { cn } from "@/lib/utils";
import type { ChatAgent, GuidedFlow } from "@/types/chat-agent-types";

export function GuidedFlowPanel({ agent }: { agent: ChatAgent }) {
  const controller = useGuidedFlowController(agent);
  const { draft, enabled, dirty, saving, issues, path, current } = controller;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-0 min-w-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Sticky action strip, the counterpart of the Profile tab's Save in the page header. */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
            <div className="flex items-center gap-3">
              <Switch checked={enabled} onCheckedChange={controller.setEnabled} />
              <span className="text-sm font-medium">
                {enabled ? "Guided flow on" : "Guided flow off"}
              </span>
              {dirty ? (
                <span className="text-[11px] font-medium text-warning">Unsaved changes</span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {dirty ? (
                <Button type="button" variant="ghost" size="sm" onClick={controller.discard}>
                  Discard
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                onClick={() => void controller.saveFlow()}
                disabled={!dirty || saving}
              >
                {saving ? "Saving…" : dirty ? "Save flow" : "Saved"}
              </Button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-3xl space-y-6">
              {!draft ? (
                <FlowOff hasSaved={Boolean(agent.guidedFlow)} dirty={dirty} />
              ) : (
                <>
                  {issues.length ? (
                    <div className="space-y-2">
                      <SectionHeading
                        title={`${issues.length} ${issues.length === 1 ? "issue" : "issues"} to fix`}
                        hint="Save is all-or-nothing — the server refuses a tree with any of these."
                      />
                      <IssueList issues={issues} />
                    </div>
                  ) : null}

                  <Breadcrumb flow={draft} path={path} onGoTo={controller.goTo} />

                  {current ? (
                    <NodeScreen flow={draft} controller={controller} />
                  ) : (
                    <RootScreen flow={draft} controller={controller} />
                  )}

                  <OrphanSection controller={controller} />

                  <SystemChipLabels flow={draft} onChange={controller.setLabels} />
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="hidden shrink-0 border-l border-border xl:block xl:w-[360px] 2xl:w-[440px]">
          <GuidedFlowPreview flow={draft} agent={agent} />
        </aside>
      </div>
    </TooltipProvider>
  );
}

/* ── Off state ──────────────────────────────────────────────────────────── */

function FlowOff({ hasSaved, dirty }: { hasSaved: boolean; dirty: boolean }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-border px-6 py-12 text-center">
      <ListTree className="mb-3 size-7 text-muted-foreground" />
      <p className="text-sm font-medium">Guided flow is off</p>
      <p className="mt-1 max-w-md text-xs leading-relaxed text-muted-foreground">
        The widget shows the message presets from the Identity section and every question goes to
        the model. Switch the flow on to author chips that answer common questions at no model cost.
      </p>
      {hasSaved && dirty ? (
        <p className="mt-3 text-[11px] font-medium text-warning">
          Saving now will delete the saved tree. Discard to keep it.
        </p>
      ) : null}
    </div>
  );
}

/* ── Breadcrumb ─────────────────────────────────────────────────────────── */

function Breadcrumb({
  flow,
  path,
  onGoTo,
}: {
  flow: GuidedFlow;
  path: string[];
  onGoTo: (depth: number) => void;
}) {
  return (
    <nav className="flex flex-wrap items-center gap-1 text-xs">
      <button
        type="button"
        onClick={() => onGoTo(0)}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted",
          path.length ? "text-muted-foreground" : "font-semibold",
        )}
      >
        <Home className="size-3" />
        Root
      </button>
      {path.map((id, index) => {
        const last = index === path.length - 1;
        return (
          <span key={`${id}-${index}`} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3 text-muted-foreground" />
            <button
              type="button"
              onClick={() => onGoTo(index + 1)}
              className={cn(
                "max-w-48 truncate rounded px-1.5 py-0.5 hover:bg-muted",
                last ? "font-semibold" : "text-muted-foreground",
              )}
            >
              {flow.nodes[id]?.label || id}
            </button>
          </span>
        );
      })}
      {path.length > GUIDED_FLOW_LIMITS.maxDepth ? (
        <Badge tone="danger-light">Deeper than {GUIDED_FLOW_LIMITS.maxDepth}</Badge>
      ) : null}
    </nav>
  );
}

/* ── Root list ──────────────────────────────────────────────────────────── */

function RootScreen({ flow, controller }: { flow: GuidedFlow; controller: GuidedFlowController }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const full = flow.rootIds.length >= GUIDED_FLOW_LIMITS.maxRoots;

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = flow.rootIds.indexOf(String(active.id));
    const to = flow.rootIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    controller.reorderRoots(from, to);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionHeading
          title="Root chips"
          hint={`What the visitor sees first. Up to ${GUIDED_FLOW_LIMITS.maxRoots}, drag to reorder.`}
        />
        <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
          {flow.rootIds.length} / {GUIDED_FLOW_LIMITS.maxRoots}
        </span>
      </div>

      {flow.rootIds.length ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={flow.rootIds} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {flow.rootIds.map((id, index) => (
                <RootRow
                  key={id}
                  flow={flow}
                  id={id}
                  index={index}
                  controller={controller}
                  onDelete={() => controller.removeRoot(id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No root chips yet. Add the three or four questions visitors ask most.
        </p>
      )}

      <ChipPicker
        flow={flow}
        exclude={flow.rootIds}
        disabled={full}
        onPick={(id) => controller.addRoot({ existingId: id })}
        onCreate={(label) => controller.addRoot({ label })}
      >
        <Button type="button" variant="dashed" size="sm" disabled={full}>
          <Plus className="size-3.5" />
          Add root chip
        </Button>
      </ChipPicker>
    </section>
  );
}

/* ── Drilled-in node ────────────────────────────────────────────────────── */

function NodeScreen({ flow, controller }: { flow: GuidedFlow; controller: GuidedFlowController }) {
  const node = controller.current!;
  const issues = controller.issuesFor(node.id);

  function remove() {
    const referrers = controller.deleteNode(node.id);
    if (referrers.length) {
      toast.error(
        `Still linked from ${referrers.map((r) => (r === "root" ? "the root chips" : `“${flow.nodes[r]?.label || r}”`)).join(", ")}. Unlink it there first.`,
      );
      return;
    }
    controller.goTo(controller.path.length - 1);
    toast.success("Node deleted");
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <SectionHeading
          title={node.label || "Untitled chip"}
          hint="What the visitor sees after pressing this chip, and where they can go next."
        />
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={remove}
          className="shrink-0 text-muted-foreground hover:text-danger"
        >
          <Trash2 className="size-3.5" />
          Delete node
        </Button>
      </div>
      <IssueList issues={issues} compact />
      <NodeFields flow={flow} node={node} controller={controller} />
    </section>
  );
}

/* ── Orphans ────────────────────────────────────────────────────────────── */

/**
 * Nodes nothing reaches. The server refuses to save while any exist, so they
 * are listed with the two ways out: put them on the home screen, or drop them.
 */
function OrphanSection({ controller }: { controller: GuidedFlowController }) {
  const { orphans, draft } = controller;
  if (!draft) return null;
  const rootFull = draft.rootIds.length >= GUIDED_FLOW_LIMITS.maxRoots;

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionHeading
          title="Orphan nodes"
          hint="Unreachable from the root chips. Link them from a node, add them to root, or delete them."
        />
        <Badge tone={orphans.length ? "danger-light" : "muted"}>{orphans.length}</Badge>
      </div>
      {orphans.length ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {orphans.map((node) => (
            <li key={node.id} className="flex items-center gap-3 px-3 py-2">
              <Unlink className="size-3.5 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => controller.enter(node.id)}
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
              >
                {node.label || node.id}
                <span className="ml-2 font-mono text-[10px] text-muted-foreground">{node.id}</span>
              </button>
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={rootFull}
                onClick={() => controller.addRoot({ existingId: node.id })}
              >
                Add to root
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="text-muted-foreground hover:text-danger"
                onClick={() => {
                  const referrers = controller.deleteNode(node.id);
                  if (referrers.length) {
                    toast.error(
                      `Still linked from ${referrers.join(", ")}. Unlink it there first.`,
                    );
                  }
                }}
                aria-label="Delete node"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Every node can be reached. Nothing to fix.</p>
      )}
    </section>
  );
}

/* ── System chip labels ─────────────────────────────────────────────────── */

function SystemChipLabels({
  flow,
  onChange,
}: {
  flow: GuidedFlow;
  onChange: (patch: Partial<GuidedFlowLabels>) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <SectionHeading
          title="System chips"
          hint="Always available in Next chips. Their labels are set once, here, and read the same everywhere."
        />
        <Button type="button" variant="ghost" size="xs" onClick={() => setOpen((v) => !v)}>
          {open ? "Done" : "Edit labels"}
        </Button>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {GUIDED_FLOW_SYSTEM_CHIPS.map((chip) => {
          const label = flow[chip.labelKey] ?? "";
          const ack = chip.ackKey ? (flow[chip.ackKey] ?? "") : null;
          return (
            <li key={chip.id} className="space-y-2 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <SystemChipIcon id={chip.id} className="size-3.5 shrink-0 text-primary" />
                {open ? (
                  <Input
                    value={label}
                    maxLength={GUIDED_FLOW_LIMITS.maxLabel}
                    onChange={(event) => onChange({ [chip.labelKey]: event.target.value })}
                    className="h-8 flex-1"
                  />
                ) : (
                  <span className={cn("flex-1 text-sm", !label && "italic text-muted-foreground")}>
                    {label || "No label"}
                  </span>
                )}
                <span className="shrink-0 text-[11px] text-muted-foreground">{chip.hint}</span>
              </div>
              {chip.ackKey && (open || ack) ? (
                <div className="flex items-center gap-3 pl-6">
                  <span className="shrink-0 text-[10px] text-muted-foreground uppercase">
                    Reply
                  </span>
                  {open ? (
                    <Input
                      value={ack ?? ""}
                      maxLength={GUIDED_FLOW_LIMITS.maxAnswer}
                      onChange={(event) => onChange({ [chip.ackKey!]: event.target.value })}
                      placeholder="Said before the root chips come back"
                      className="h-8 flex-1"
                    />
                  ) : (
                    <span className="truncate text-xs text-muted-foreground">{ack}</span>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

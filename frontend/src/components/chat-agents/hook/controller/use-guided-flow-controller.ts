import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";

import {
  readGuidedFlowIssues,
  useSaveGuidedFlow,
} from "@/components/chat-agents/hook/mutation/use-chat-agent-mutations";
import { getErrorMessage } from "@/lib/axios-config";
import {
  GUIDED_FLOW_DEFAULT_LABELS,
  GUIDED_FLOW_LIMITS,
  guidedFlowOrphans,
  guidedFlowReferrers,
  isGuidedFlowReservedId,
  slugifyGuidedNodeId,
  validateGuidedFlow,
} from "@/lib/chat-agent-constants";
import type {
  ChatAgent,
  GuidedFlow,
  GuidedFlowIssue,
  GuidedFlowNode,
} from "@/types/chat-agent-types";

/** The six tree-level strings the "system chip labels" card edits. */
export type GuidedFlowLabels = Pick<
  GuidedFlow,
  | "escapeToAiLabel"
  | "escapeToHumanLabel"
  | "markIntlYesLabel"
  | "markIntlNoLabel"
  | "markIntlYesAck"
  | "markIntlNoAck"
>;

function serialise(flow: GuidedFlow | null) {
  return JSON.stringify(flow ?? null);
}

function clone(flow: GuidedFlow | null): GuidedFlow | null {
  return flow ? (JSON.parse(JSON.stringify(flow)) as GuidedFlow) : null;
}

function blankFlow(): GuidedFlow {
  return { rootIds: [], nodes: {}, ...GUIDED_FLOW_DEFAULT_LABELS };
}

/**
 * Everything the Flow tab does to a tree before it is saved.
 *
 * The draft is a plain object edited immutably — not react-hook-form, because
 * a graph keyed by id with drill-in navigation is not a form: fields come and
 * go as nodes are created, and "dirty" means "differs from what the server
 * holds", which one JSON comparison answers. Validation runs on every change
 * so a problem is marked the moment it is made, and the server's own issue
 * list (from a 400) is merged in so both read the same way.
 */
export function useGuidedFlowController(agent: ChatAgent) {
  const serverFlow = agent.guidedFlow ?? null;
  const serverKey = serialise(serverFlow);

  const [draft, setDraft] = useState<GuidedFlow | null>(() => clone(serverFlow));
  const [baselineKey, setBaselineKey] = useState(serverKey);
  /** Node ids drilled into, root first. Empty = the root list. */
  const [path, setPath] = useState<string[]>([]);
  const [serverIssues, setServerIssues] = useState<GuidedFlowIssue[]>([]);

  const save = useSaveGuidedFlow(agent.id);

  const dirty = serialise(draft) !== baselineKey;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // Adopt what the server now holds — but never over unsaved edits. A refetch
  // on window focus must not throw away ten minutes of authoring.
  useEffect(() => {
    if (serverKey === baselineKey) return;
    if (dirtyRef.current) return;
    setDraft(clone(serverFlow));
    setBaselineKey(serverKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverKey]);

  // Same guard the Profile tab has: a tree is minutes of authoring, and a tab
  // close is the one exit a React prompt cannot catch.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Drilling into a node that has since been deleted lands on the root list.
  useEffect(() => {
    if (!draft) {
      if (path.length) setPath([]);
      return;
    }
    const valid = path.filter((id) => draft.nodes[id]);
    if (valid.length !== path.length) setPath(valid);
  }, [draft, path]);

  const clientIssues = useMemo(() => (draft ? validateGuidedFlow(draft) : []), [draft]);
  const issues = useMemo(() => [...clientIssues, ...serverIssues], [clientIssues, serverIssues]);
  const orphans = useMemo(() => (draft ? guidedFlowOrphans(draft) : []), [draft]);

  /** Issues attached to one node, so a card can show its own problems. */
  const issuesFor = useCallback(
    (nodeId: string) =>
      issues.filter((issue) => issue.where === nodeId || issue.where?.startsWith(`${nodeId} →`)),
    [issues],
  );

  const update = useCallback((fn: (flow: GuidedFlow) => GuidedFlow) => {
    setServerIssues([]);
    setDraft((current) => (current ? fn(current) : current));
  }, []);

  /* ── Tree-level ─────────────────────────────────────────────────────────── */

  const setEnabled = useCallback((on: boolean) => {
    setServerIssues([]);
    setPath([]);
    setDraft((current) => (on ? (current ?? blankFlow()) : null));
  }, []);

  const setLabels = useCallback(
    (patch: Partial<GuidedFlowLabels>) => update((flow) => ({ ...flow, ...patch })),
    [update],
  );

  /* ── Nodes ──────────────────────────────────────────────────────────────── */

  const createNode = useCallback((flow: GuidedFlow, label: string): [GuidedFlow, string] => {
    const id = slugifyGuidedNodeId(label, Object.keys(flow.nodes));
    const node: GuidedFlowNode = { id, label: label.trim(), answer: "", next: [] };
    return [{ ...flow, nodes: { ...flow.nodes, [id]: node } }, id];
  }, []);

  const updateNode = useCallback(
    (id: string, patch: Partial<Pick<GuidedFlowNode, "label" | "answer">>) =>
      update((flow) => {
        const node = flow.nodes[id];
        if (!node) return flow;
        return { ...flow, nodes: { ...flow.nodes, [id]: { ...node, ...patch } } };
      }),
    [update],
  );

  /**
   * Remove a node outright. Refused while anything still points at it — the
   * caller gets the referrers back to show, and nothing changes. Children are
   * left in place; if this was their only way in they surface as orphans.
   */
  const deleteNode = useCallback(
    (id: string): string[] => {
      if (!draft) return [];
      const referrers = guidedFlowReferrers(draft, id);
      if (referrers.length) return referrers;
      update((flow) => {
        const nodes = { ...flow.nodes };
        delete nodes[id];
        return { ...flow, nodes };
      });
      return [];
    },
    [draft, update],
  );

  /* ── Root chips ─────────────────────────────────────────────────────────── */

  const addRoot = useCallback(
    (target: { existingId: string } | { label: string }) =>
      update((flow) => {
        if (flow.rootIds.length >= GUIDED_FLOW_LIMITS.maxRoots) return flow;
        if ("existingId" in target) {
          if (flow.rootIds.includes(target.existingId)) return flow;
          return { ...flow, rootIds: [...flow.rootIds, target.existingId] };
        }
        const [next, id] = createNode(flow, target.label);
        return { ...next, rootIds: [...next.rootIds, id] };
      }),
    [createNode, update],
  );

  /**
   * Take a chip off the home screen. A node nothing else links to goes with
   * it — leaving it behind would only produce an orphan to clean up next.
   */
  const removeRoot = useCallback(
    (id: string) =>
      update((flow) => {
        const rootIds = flow.rootIds.filter((entry) => entry !== id);
        const next = { ...flow, rootIds };
        if (isGuidedFlowReservedId(id) || guidedFlowReferrers(next, id).length) return next;
        const nodes = { ...next.nodes };
        delete nodes[id];
        return { ...next, nodes };
      }),
    [update],
  );

  const reorderRoots = useCallback(
    (from: number, to: number) =>
      update((flow) => ({ ...flow, rootIds: arrayMove(flow.rootIds, from, to) })),
    [update],
  );

  /* ── Next chips ─────────────────────────────────────────────────────────── */

  const addNext = useCallback(
    (nodeId: string, target: { existingId: string } | { label: string }) =>
      update((flow) => {
        const node = flow.nodes[nodeId];
        if (!node || node.next.length >= GUIDED_FLOW_LIMITS.maxNext) return flow;
        if ("existingId" in target) {
          if (node.next.includes(target.existingId) || target.existingId === nodeId) return flow;
          return {
            ...flow,
            nodes: {
              ...flow.nodes,
              [nodeId]: { ...node, next: [...node.next, target.existingId] },
            },
          };
        }
        const [withNode, id] = createNode(flow, target.label);
        const parent = withNode.nodes[nodeId];
        return {
          ...withNode,
          nodes: { ...withNode.nodes, [nodeId]: { ...parent, next: [...parent.next, id] } },
        };
      }),
    [createNode, update],
  );

  const removeNext = useCallback(
    (nodeId: string, targetId: string) =>
      update((flow) => {
        const node = flow.nodes[nodeId];
        if (!node) return flow;
        return {
          ...flow,
          nodes: {
            ...flow.nodes,
            [nodeId]: { ...node, next: node.next.filter((id) => id !== targetId) },
          },
        };
      }),
    [update],
  );

  /* ── Navigation ─────────────────────────────────────────────────────────── */

  const enter = useCallback(
    (id: string) => {
      if (!draft?.nodes[id]) return;
      setPath((current) => [...current, id]);
    },
    [draft],
  );

  /** Jump to a breadcrumb: -1 (or 0) is the root list. */
  const goTo = useCallback((depth: number) => {
    setPath((current) => current.slice(0, Math.max(0, depth)));
  }, []);

  /* ── Save ───────────────────────────────────────────────────────────────── */

  const saveFlow = useCallback(async () => {
    if (draft && clientIssues.length) {
      toast.error(
        `Fix ${clientIssues.length} ${clientIssues.length === 1 ? "issue" : "issues"} before saving.`,
      );
      return;
    }
    try {
      const result = await save.mutateAsync(draft);
      const saved = result.guidedFlow ?? null;
      setDraft(clone(saved));
      setBaselineKey(serialise(saved));
      setServerIssues([]);
      toast.success(result.cleared ? "Guided flow switched off" : "Guided flow saved");
    } catch (err) {
      const fromServer = readGuidedFlowIssues(err);
      if (fromServer) {
        setServerIssues(fromServer);
        toast.error(
          fromServer.length
            ? `The server found ${fromServer.length} ${fromServer.length === 1 ? "problem" : "problems"} with this flow.`
            : "The server rejected this flow.",
        );
        return;
      }
      toast.error(getErrorMessage(err, "Could not save the guided flow"));
    }
  }, [clientIssues.length, draft, save]);

  const discard = useCallback(() => {
    setDraft(clone(serverFlow));
    setBaselineKey(serverKey);
    setServerIssues([]);
    setPath([]);
  }, [serverFlow, serverKey]);

  const current = path.length && draft ? (draft.nodes[path[path.length - 1]] ?? null) : null;

  return {
    draft,
    enabled: draft !== null,
    dirty,
    saving: save.isPending,
    issues,
    issuesFor,
    orphans,
    path,
    current,

    setEnabled,
    setLabels,
    updateNode,
    deleteNode,
    addRoot,
    removeRoot,
    reorderRoots,
    addNext,
    removeNext,
    enter,
    goTo,
    saveFlow,
    discard,
  };
}

export type GuidedFlowController = ReturnType<typeof useGuidedFlowController>;

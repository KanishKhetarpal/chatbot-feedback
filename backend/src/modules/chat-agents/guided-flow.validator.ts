import {
  GUIDED_FLOW_LIMITS,
  GuidedFlow,
  RESERVED_NODE_IDS,
  type ReservedNodeId,
} from './schemas/guided-flow.schema';

/**
 * Semantic problems zod cannot express: cycles beyond depth, orphan nodes,
 * missing node references, reserved-id misuse, node-count ceiling.
 *
 * Returns the FULL list of issues on failure (not just the first one) so the
 * admin editor can render them inline in one round-trip. If the list is
 * empty the tree is safe to save.
 */
export interface GuidedFlowIssue {
  code:
    | 'unknown_next_ref'
    | 'reserved_id_used_as_node'
    | 'orphan_node'
    | 'depth_exceeded'
    | 'too_many_nodes'
    | 'root_ref_missing'
    | 'duplicate_root';
  message: string;
  /** The node id at fault, or the offending edge for `unknown_next_ref`. */
  where: string;
}

export function validateGuidedFlow(flow: GuidedFlow): GuidedFlowIssue[] {
  const issues: GuidedFlowIssue[] = [];
  const nodes = flow.nodes;
  const nodeIds = new Set(Object.keys(nodes));
  const reserved = new Set<ReservedNodeId>(RESERVED_NODE_IDS);

  // ── 1. Reserved ids in nodes[] ─────────────────────────────────────────
  // Reserved ids are runtime-only. If an admin authors one under `nodes`,
  // saves would succeed and then two definitions would fight at runtime.
  for (const id of nodeIds) {
    if (reserved.has(id as ReservedNodeId)) {
      issues.push({
        code: 'reserved_id_used_as_node',
        message: `"${id}" is a reserved node id — remove it from nodes.`,
        where: id,
      });
    }
  }

  // ── 2. Node ceiling ─────────────────────────────────────────────────────
  if (nodeIds.size > GUIDED_FLOW_LIMITS.maxNodes) {
    issues.push({
      code: 'too_many_nodes',
      message: `Flow has ${nodeIds.size} nodes; max is ${GUIDED_FLOW_LIMITS.maxNodes}.`,
      where: 'flow',
    });
  }

  // ── 3. Root duplicates ──────────────────────────────────────────────────
  const rootSeen = new Set<string>();
  for (const rid of flow.rootIds) {
    if (rootSeen.has(rid)) {
      issues.push({
        code: 'duplicate_root',
        message: `rootIds contains "${rid}" more than once.`,
        where: rid,
      });
    }
    rootSeen.add(rid);
  }

  // ── 4. Roots resolve to a real node ─────────────────────────────────────
  for (const rid of flow.rootIds) {
    if (reserved.has(rid as ReservedNodeId)) continue; // reserved as root is unusual but not fatal
    if (!nodeIds.has(rid)) {
      issues.push({
        code: 'root_ref_missing',
        message: `rootIds mentions "${rid}" but no such node exists.`,
        where: rid,
      });
    }
  }

  // ── 5. Every next[] entry resolves ──────────────────────────────────────
  for (const node of Object.values(nodes)) {
    for (const nextId of node.next) {
      if (reserved.has(nextId as ReservedNodeId)) continue;
      if (!nodeIds.has(nextId)) {
        issues.push({
          code: 'unknown_next_ref',
          message: `Node "${node.id}" links to unknown node "${nextId}".`,
          where: `${node.id} → ${nextId}`,
        });
      }
    }
  }

  // ── 6. Orphans (unreachable from any root) ──────────────────────────────
  // BFS from every root. Cycles are fine — reachable is a set, not a walk.
  const reachable = new Set<string>();
  const queue: string[] = flow.rootIds.filter((id) => nodeIds.has(id));
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (reachable.has(id)) continue;
    reachable.add(id);
    const node = nodes[id];
    if (!node) continue;
    for (const nextId of node.next) {
      if (reserved.has(nextId as ReservedNodeId)) continue;
      if (!nodeIds.has(nextId)) continue;
      if (!reachable.has(nextId)) queue.push(nextId);
    }
  }
  for (const id of nodeIds) {
    if (!reachable.has(id)) {
      issues.push({
        code: 'orphan_node',
        message: `Node "${id}" is not reachable from any root.`,
        where: id,
      });
    }
  }

  // ── 7. Depth ceiling ────────────────────────────────────────────────────
  // A path is a distinct chain of node ids; cycles back to a root count as one
  // completed path (they don't recurse forever because we track the depth of
  // the FIRST visit, not the current). We use DFS with a per-path visited set.
  const walk = (id: string, depth: number, path: Set<string>): void => {
    if (depth > GUIDED_FLOW_LIMITS.maxDepth) {
      issues.push({
        code: 'depth_exceeded',
        message: `Path through "${id}" exceeds max depth ${GUIDED_FLOW_LIMITS.maxDepth}.`,
        where: id,
      });
      return;
    }
    if (reserved.has(id as ReservedNodeId)) return; // reserved ids terminate the path
    const node = nodes[id];
    if (!node) return;
    if (path.has(id)) return; // cycle — stop, already counted along another path
    const nextPath = new Set(path);
    nextPath.add(id);
    for (const nextId of node.next) walk(nextId, depth + 1, nextPath);
  };
  for (const rid of flow.rootIds) walk(rid, 1, new Set<string>());

  // Dedup depth_exceeded issues (multiple paths through the same node → same message).
  const seenDepth = new Set<string>();
  const deduped: GuidedFlowIssue[] = [];
  for (const issue of issues) {
    if (issue.code === 'depth_exceeded') {
      if (seenDepth.has(issue.where)) continue;
      seenDepth.add(issue.where);
    }
    deduped.push(issue);
  }

  return deduped;
}

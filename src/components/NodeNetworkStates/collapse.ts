import { facesPods, Topology, TopologyEdge, TopologyNode } from '../../nmstate/topology';

/** Beyond this many pod-facing ports on one controller, they are folded away. */
export const COLLAPSE_AT = 4;

export const GROUP_PREFIX = '__ports__';

export interface CollapsedTopology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  /** Controller id -> the interfaces folded into its summary node. */
  folded: Map<string, TopologyNode[]>;
}

/**
 * Folds a controller's pod-facing ports into a single summary node.
 *
 * A bridge on a busy worker carries one veth per pod. Drawn individually they
 * are a row of identical boxes that say nothing beyond their count — the
 * structure worth seeing is the uplink and the bridge — while stretching the
 * diagram until nothing is legible without zooming out. Folding them keeps the
 * count visible and the stack readable; expanding one puts them back.
 *
 * Only ports below their controller are folded: an uplink is never
 * interchangeable with the others.
 */
export function collapsePodPorts(
  topology: Topology,
  visible: Set<string>,
  expanded: Set<string>
): CollapsedTopology {
  const byId = new Map(topology.nodes.map(n => [n.id, n]));
  const candidates = new Map<string, TopologyNode[]>();

  for (const edge of topology.edges) {
    if (!visible.has(edge.source) || !visible.has(edge.target)) continue;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;
    if (!facesPods(source) || source.rank <= target.rank) continue;
    if (!candidates.has(edge.target)) candidates.set(edge.target, []);
    candidates.get(edge.target)?.push(source);
  }

  const folded = new Map<string, TopologyNode[]>();
  const hidden = new Set<string>();
  for (const [controller, ports] of candidates) {
    if (ports.length < COLLAPSE_AT || expanded.has(controller)) continue;
    // A port wired to more than its controller would lose an edge if folded.
    const foldable = ports.filter(
      port => topology.edges.filter(e => e.source === port.id || e.target === port.id).length === 1
    );
    if (foldable.length < COLLAPSE_AT) continue;
    folded.set(controller, foldable);
    foldable.forEach(port => hidden.add(port.id));
  }

  const nodes = topology.nodes.filter(n => visible.has(n.id) && !hidden.has(n.id));
  const edges = topology.edges.filter(
    e =>
      visible.has(e.source) &&
      visible.has(e.target) &&
      !hidden.has(e.source) &&
      !hidden.has(e.target)
  );

  for (const [controller, ports] of folded) {
    const anchor = byId.get(controller) as TopologyNode;
    const id = `${GROUP_PREFIX}${controller}`;
    nodes.push({
      ...ports[0],
      id,
      name: `${ports.length} pod ports`,
      addresses: [],
      mtu: undefined,
      mac: undefined,
      iface: undefined,
      policy: undefined,
      failureMessage: undefined,
      failureDetail: undefined,
      rank: anchor.rank + 1,
      order: 0,
      isolated: false,
      cluster: anchor.cluster,
      collapsed: ports.length,
    });
    edges.push({
      id: `${id}->${controller}`,
      source: id,
      target: controller,
      kind: 'bridge-port',
    });
  }

  return { nodes, edges, folded };
}

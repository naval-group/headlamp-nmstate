import { NmstateInterface } from './types';

/**
 * How an interface came to exist, as far as we can tell from the cluster.
 *
 * - `managed`  — an enactment (or policy) declares this interface on this node
 * - `failing`  — same, but the enactment's Failing condition is True
 * - `observed` — present in the node's state, claimed by no policy
 * - `phantom`  — referenced as a port/base of another interface but absent from
 *                `interfaces[]`. This is the normal case, not an error: the
 *                handler filters out every veth-typed interface, which on a busy
 *                node is most of them (65 of 77 on a real worker).
 */
export type Provenance = 'managed' | 'failing' | 'observed' | 'phantom';

export interface TopologyNode {
  id: string;
  name: string;
  type: string;
  state: string;
  provenance: Provenance;
  /** Populated for `managed` / `failing` nodes. */
  policy?: string;
  failureMessage?: string;
  failureDetail?: string;
  iface?: NmstateInterface;
  addresses: string[];
  mtu?: number;
  mac?: string;
  /**
   * Row index from the top of the diagram, 0 being the topmost.
   *
   * Not a dependency depth: the diagram is oriented by role, with the physical
   * network at the top and the pods at the bottom. See {@link assignDepths}.
   */
  rank: number;
  /** Horizontal position within the rank. */
  order: number;
  /** True when nothing connects to this interface, in either direction. */
  isolated: boolean;
  /** Index of the connected component this interface belongs to. */
  cluster: number;
  /** Set on a summary node standing in for this many folded interfaces. */
  collapsed?: number;
}

/**
 * One connected component of the interface graph.
 *
 * Every edge stays inside its component by definition, so laying each one out
 * in its own block and placing the blocks side by side means edges can never
 * cross between unrelated stacks — which is what turned a node with two
 * bridges and ten ports into a thicket of overlapping links.
 */
export interface TopologyCluster {
  id: number;
  /** Ids of the interfaces in this component. */
  nodes: string[];
  /** Widest rank, counted in node slots. */
  width: number;
  maxRank: number;
  /** A single interface connected to nothing. */
  isolated: boolean;
  /** The component's most important interface, used as its title. */
  label: string;
}

export interface TopologyEdge {
  id: string;
  /** The underlying interface. */
  source: string;
  /** The interface built on top of it. */
  target: string;
  kind: 'bridge-port' | 'bond-port' | 'base-iface' | 'vrf-port' | 'veth-peer' | 'controller';
}

export interface Topology {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  clusters: TopologyCluster[];
  /** Names referenced as ports but filtered out of the reported state. */
  phantomCount: number;
  maxRank: number;
}

/** Names of the sub-object holding a `base-iface` pointer, per interface type. */
const BASE_IFACE_HOLDERS = ['vlan', 'vxlan', 'mac-vlan', 'mac-vtap', 'ipvlan', 'infiniband'];

function addressesOf(iface: NmstateInterface): string[] {
  const out: string[] = [];
  for (const stack of [iface.ipv4, iface.ipv6]) {
    if (!stack?.enabled) continue;
    for (const a of stack.address ?? []) {
      if (a?.ip) out.push(`${a.ip}/${a['prefix-length']}`);
    }
  }
  return out;
}

/**
 * Builds the interface dependency graph for a single node.
 *
 * Edges point from the underlying interface to the one layered on top, so a
 * longest-path ranking puts physical NICs at rank 0 and bridges above them.
 * The graph is a DAG, not a ladder: a VLAN may sit on a bond, on another VLAN
 * (QinQ) or directly on a NIC, so ranks are computed rather than assumed from
 * the interface type.
 */
export function buildTopology(
  interfaces: NmstateInterface[],
  provenanceOf: (name: string) => {
    provenance: Provenance;
    policy?: string;
    failureMessage?: string;
    failureDetail?: string;
  } = () => ({ provenance: 'observed' })
): Topology {
  const nodes = new Map<string, TopologyNode>();
  const edges: TopologyEdge[] = [];
  const known = new Set(interfaces.map(i => i.name));

  const ensure = (name: string, iface?: NmstateInterface): TopologyNode => {
    const existing = nodes.get(name);
    if (existing) return existing;
    const p = iface ? provenanceOf(name) : { provenance: 'phantom' as Provenance };
    const node: TopologyNode = {
      id: name,
      name,
      type: iface?.type ?? 'veth',
      state: iface?.state ?? 'unknown',
      provenance: p.provenance,
      policy: 'policy' in p ? p.policy : undefined,
      failureMessage: 'failureMessage' in p ? p.failureMessage : undefined,
      failureDetail: 'failureDetail' in p ? p.failureDetail : undefined,
      iface,
      addresses: iface ? addressesOf(iface) : [],
      mtu: iface?.mtu,
      mac: iface?.['mac-address'],
      rank: 0,
      order: 0,
      isolated: true,
      cluster: -1,
    };
    nodes.set(name, node);
    return node;
  };

  interfaces.forEach(i => ensure(i.name, i));

  const link = (source: string, target: string, kind: TopologyEdge['kind']) => {
    if (source === target) return;
    ensure(source);
    ensure(target);
    const id = `${source}->${target}`;
    if (edges.some(e => e.id === id)) return;
    edges.push({ id, source, target, kind });
  };

  for (const iface of interfaces) {
    // Bridge ports (linux-bridge and ovs-bridge share the shape).
    for (const port of iface.bridge?.port ?? []) {
      if (port?.name) link(port.name, iface.name, 'bridge-port');
    }
    // Bond / OVS link aggregation members.
    for (const port of iface['link-aggregation']?.port ?? []) {
      if (port) link(port, iface.name, 'bond-port');
    }
    // VRF members.
    for (const port of iface.vrf?.port ?? []) {
      if (port) link(port, iface.name, 'vrf-port');
    }
    // Layered interfaces pointing at the interface they sit on.
    for (const holder of BASE_IFACE_HOLDERS) {
      const base = (iface[holder] as { 'base-iface'?: string } | undefined)?.['base-iface'];
      if (base) link(base, iface.name, 'base-iface');
    }
    // veth pairs.
    const peer = iface.veth?.peer;
    if (peer) link(peer, iface.name, 'veth-peer');
    // `controller` is the reverse of bridge.port[] and is sometimes populated
    // when the controller's own port list is incomplete, so it is a second
    // source of truth for the same relation rather than a duplicate.
    if (iface.controller && known.has(iface.controller)) {
      link(iface.name, iface.controller, 'controller');
    }
  }

  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (source) source.isolated = false;
    if (target) target.isolated = false;
  }

  for (const edge of edges) {
    const source = nodes.get(edge.source);
    const target = nodes.get(edge.target);
    if (source) source.isolated = false;
    if (target) target.isolated = false;
  }

  assignDepths(nodes, edges);
  const clusters = assignClusters(nodes, edges);
  orderWithinClusters(nodes, edges, clusters);

  const list = [...nodes.values()];
  return {
    nodes: list,
    edges,
    clusters,
    phantomCount: list.filter(n => n.provenance === 'phantom').length,
    maxRank: list.reduce((m, n) => Math.max(m, n.rank), 0),
  };
}

/** Ranks the most structural interface of a component highest, for its title. */
const LABEL_PRIORITY = ['ovs-bridge', 'linux-bridge', 'bond', 'vrf', 'vxlan', 'vlan', 'ethernet'];

/**
 * Splits the graph into connected components, treating edges as undirected.
 *
 * Components are returned largest first so the busiest stack gets the leftmost,
 * most readable position, with single unconnected interfaces last.
 */
function assignClusters(
  nodes: Map<string, TopologyNode>,
  edges: TopologyEdge[]
): TopologyCluster[] {
  const neighbours = new Map<string, string[]>();
  for (const id of nodes.keys()) neighbours.set(id, []);
  for (const e of edges) {
    neighbours.get(e.source)?.push(e.target);
    neighbours.get(e.target)?.push(e.source);
  }

  const seen = new Set<string>();
  const groups: string[][] = [];
  for (const id of [...nodes.keys()].sort()) {
    if (seen.has(id)) continue;
    const group: string[] = [];
    const queue = [id];
    seen.add(id);
    while (queue.length) {
      const current = queue.shift() as string;
      group.push(current);
      for (const next of neighbours.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push(next);
      }
    }
    groups.push(group);
  }

  groups.sort((a, b) => b.length - a.length || a[0].localeCompare(b[0]));

  return groups.map((group, index) => {
    const members = group.map(id => nodes.get(id)).filter(Boolean) as TopologyNode[];
    members.forEach(n => (n.cluster = index));

    const perRank = new Map<number, number>();
    let maxRank = 0;
    for (const member of members) {
      perRank.set(member.rank, (perRank.get(member.rank) ?? 0) + 1);
      maxRank = Math.max(maxRank, member.rank);
    }

    const titled = [...members].sort((a, b) => {
      const pa = LABEL_PRIORITY.indexOf(a.type);
      const pb = LABEL_PRIORITY.indexOf(b.type);
      return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb) || b.rank - a.rank;
    });

    return {
      id: index,
      nodes: group,
      width: Math.max(...perRank.values()),
      maxRank,
      isolated: members.length === 1,
      label: titled[0]?.name ?? '',
    };
  });
}

/**
 * Interface types that face the pods rather than the physical network.
 *
 * A bridge's ports are not all alike: an uplink and a pod's veth are both
 * "ports", but drawing them on the same row is what made the diagram unreadable
 * — nothing said which side of the bridge traffic entered from.
 */
const POD_FACING = new Set(['veth', 'tun', 'dummy']);

export function facesPods(node: TopologyNode): boolean {
  return POD_FACING.has(node.type) || node.provenance === 'phantom';
}

/**
 * Places every interface on a row, orienting the diagram by role.
 *
 * The physical network sits at the top and the pods at the bottom, so a stack
 * reads the way traffic flows: uplink, bridge, then the pod-facing ends. That
 * means an edge does not always point the same way on screen. For an edge from
 * an underlying interface to the one layered on it, the underlying interface
 * goes *above* — a NIC above its bridge, a bond above its VLAN — unless it is
 * pod-facing, in which case it goes below.
 *
 * Depths are relative within each connected component and normalised so the
 * topmost row of every component is 0, which is what lets components be drawn
 * side by side as independent blocks.
 */
function assignDepths(nodes: Map<string, TopologyNode>, edges: TopologyEdge[]) {
  const links = new Map<string, { other: string; delta: number }[]>();
  for (const id of nodes.keys()) links.set(id, []);

  for (const edge of edges) {
    const source = nodes.get(edge.source);
    if (!source) continue;
    // delta is how far below the target the source sits.
    const delta = facesPods(source) ? 1 : -1;
    links.get(edge.source)?.push({ other: edge.target, delta: -delta });
    links.get(edge.target)?.push({ other: edge.source, delta });
  }

  const assigned = new Map<string, number>();
  for (const id of [...nodes.keys()].sort()) {
    if (assigned.has(id)) continue;

    // Breadth-first from an arbitrary member of the component. Contradictory
    // constraints — which nmstate should never produce — keep the first
    // assignment rather than looping.
    const component: string[] = [];
    assigned.set(id, 0);
    const queue = [id];
    while (queue.length) {
      const current = queue.shift() as string;
      component.push(current);
      const depth = assigned.get(current) ?? 0;
      for (const link of links.get(current) ?? []) {
        if (assigned.has(link.other)) continue;
        assigned.set(link.other, depth + link.delta);
        queue.push(link.other);
      }
    }

    const top = Math.min(...component.map(member => assigned.get(member) ?? 0));
    for (const member of component) {
      const node = nodes.get(member);
      if (node) node.rank = (assigned.get(member) ?? 0) - top;
    }
  }
}

/**
 * Orders nodes inside each row of each component to reduce edge crossings.
 *
 * Ordering is per component rather than global: positions only ever need to be
 * comparable against the nodes a component's own edges touch, and keeping the
 * ordering local is what lets each component be drawn as a self-contained
 * block.
 *
 * Plain barycenter heuristic — repeatedly place each node at the average
 * position of its neighbours on adjacent rows. Four passes is well past the
 * point of diminishing returns for graphs this size.
 */
function orderWithinClusters(
  nodes: Map<string, TopologyNode>,
  edges: TopologyEdge[],
  clusters: TopologyCluster[]
) {
  const neighbours = new Map<string, string[]>();
  for (const id of nodes.keys()) neighbours.set(id, []);
  for (const e of edges) {
    neighbours.get(e.target)?.push(e.source);
    neighbours.get(e.source)?.push(e.target);
  }

  for (const cluster of clusters) {
    const members = cluster.nodes.map(id => nodes.get(id)).filter(Boolean) as TopologyNode[];
    const byRow = new Map<number, TopologyNode[]>();
    for (const node of members) {
      if (!byRow.has(node.rank)) byRow.set(node.rank, []);
      byRow.get(node.rank)?.push(node);
    }

    // Deterministic seed so the layout does not jitter between renders.
    for (const list of byRow.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
      list.forEach((n, i) => (n.order = i));
    }

    const rows = [...byRow.keys()].sort((a, b) => a - b);
    for (let pass = 0; pass < 4; pass++) {
      for (const row of rows) {
        const list = byRow.get(row) ?? [];
        const barycenter = new Map<string, number>();
        for (const node of list) {
          const positions = (neighbours.get(node.id) ?? [])
            .map(id => nodes.get(id))
            .filter(n => n && n.rank !== node.rank)
            .map(n => (n as TopologyNode).order);
          barycenter.set(
            node.id,
            positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : node.order
          );
        }
        list.sort(
          (a, b) =>
            (barycenter.get(a.id) ?? 0) - (barycenter.get(b.id) ?? 0) ||
            a.name.localeCompare(b.name)
        );
        list.forEach((n, i) => (n.order = i));
      }
    }
  }
}

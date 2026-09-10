import { Topology, TopologyCluster, TopologyNode } from '../../nmstate/topology';

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 96;
const H_GAP = 28;
const V_GAP = 64;
const PAD = 12;
const HEADER = 26;
const CLUSTER_GAP = 40;
/**
 * Widest a row is allowed to get before it wraps.
 *
 * A bridge with a dozen pod veths stretched its frame far wider than the
 * screen; wrapping keeps a stack roughly as wide as it is tall, so several of
 * them fit side by side without zooming out.
 */
const MAX_COLUMNS = 5;
/** Columns used to pack interfaces that connect to nothing. */
const UNCONNECTED_COLUMNS = 4;
/** Vertical space between wrapped lines of the same row. */
const WRAP_GAP = 14;

export interface PlacedNode {
  node: TopologyNode;
  /** Position relative to the node's cluster frame. */
  x: number;
  y: number;
  clusterId: string;
}

export interface PlacedCluster {
  id: string;
  label: string;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
  isolatedGroup: boolean;
}

export interface Placement {
  clusters: PlacedCluster[];
  nodes: PlacedNode[];
}

/**
 * Places each connected component in its own frame, frames side by side.
 *
 * Laying the whole graph out as one grid meant a bridge's ports sat in the same
 * row as an unrelated bridge's ports, and the links between them crossed over
 * each other until it was impossible to tell which port belonged to which
 * bridge. Because every edge stays inside its component, giving each component
 * its own frame removes those crossings entirely rather than merely reducing
 * them.
 *
 * Interfaces that connect to nothing carry no structure worth a frame each, so
 * they are packed into a single grid at the end.
 */
export function placeTopology(topology: Topology, visible: Set<string>): Placement {
  const byId = new Map(topology.nodes.map(n => [n.id, n]));
  const clusters: PlacedCluster[] = [];
  const nodes: PlacedNode[] = [];

  const connected: TopologyCluster[] = [];
  const loose: TopologyNode[] = [];

  for (const cluster of topology.clusters) {
    const members = cluster.nodes.map(id => byId.get(id)).filter(n => n && visible.has(n.id));
    if (members.length === 0) continue;
    if (cluster.isolated || members.length === 1) {
      loose.push(...(members as TopologyNode[]));
    } else {
      connected.push(cluster);
    }
  }

  let cursorX = 0;

  for (const cluster of connected) {
    const members = cluster.nodes
      .map(id => byId.get(id))
      .filter(n => n && visible.has(n.id)) as TopologyNode[];

    // Rows are re-packed against what is actually visible, so hiding a row with
    // a filter does not leave an empty band inside the frame.
    const depths = [...new Set(members.map(n => n.rank))].sort((a, b) => a - b);
    const perDepth = new Map<number, TopologyNode[]>();
    for (const member of members) {
      if (!perDepth.has(member.rank)) perDepth.set(member.rank, []);
      perDepth.get(member.rank)?.push(member);
    }

    const widest = Math.max(
      ...depths.map(depth => Math.min((perDepth.get(depth) ?? []).length, MAX_COLUMNS))
    );
    const width = widest * NODE_WIDTH + (widest - 1) * H_GAP + 2 * PAD;

    // A row wider than MAX_COLUMNS wraps onto further lines, so the frame's
    // height depends on how many lines each row needs.
    const linesPerDepth = depths.map(depth =>
      Math.ceil((perDepth.get(depth) ?? []).length / MAX_COLUMNS)
    );
    const totalLines = linesPerDepth.reduce((a, b) => a + b, 0);
    const height =
      totalLines * NODE_HEIGHT +
      (totalLines - depths.length) * WRAP_GAP +
      (depths.length - 1) * V_GAP +
      2 * PAD +
      HEADER;

    const id = `cluster-${cluster.id}`;
    clusters.push({
      id,
      label: cluster.label,
      count: members.length,
      x: cursorX,
      y: 0,
      width,
      height,
      isolatedGroup: false,
    });

    let y = HEADER + PAD;
    depths.forEach(depth => {
      const list = (perDepth.get(depth) ?? []).sort((a, b) => a.order - b.order);
      for (let start = 0; start < list.length; start += MAX_COLUMNS) {
        const line = list.slice(start, start + MAX_COLUMNS);
        const lineWidth = line.length * NODE_WIDTH + (line.length - 1) * H_GAP;
        // Short lines are centred, so a bridge sits above the middle of its
        // ports rather than being pinned to the left edge of the frame.
        const offset = PAD + (width - 2 * PAD - lineWidth) / 2;
        line.forEach((member, index) => {
          nodes.push({
            node: member,
            clusterId: id,
            x: offset + index * (NODE_WIDTH + H_GAP),
            y,
          });
        });
        y += NODE_HEIGHT + WRAP_GAP;
      }
      y += V_GAP - WRAP_GAP;
    });

    cursorX += width + CLUSTER_GAP;
  }

  if (loose.length > 0) {
    loose.sort((a, b) => a.name.localeCompare(b.name));
    const columns = Math.min(UNCONNECTED_COLUMNS, loose.length);
    const rows = Math.ceil(loose.length / columns);
    const width = columns * NODE_WIDTH + (columns - 1) * H_GAP + 2 * PAD;
    const height = rows * NODE_HEIGHT + (rows - 1) * 16 + 2 * PAD + HEADER;
    const id = 'cluster-unconnected';

    clusters.push({
      id,
      label: 'Not connected',
      count: loose.length,
      x: cursorX,
      y: 0,
      width,
      height,
      isolatedGroup: true,
    });

    loose.forEach((member, index) => {
      nodes.push({
        node: member,
        clusterId: id,
        x: PAD + (index % columns) * (NODE_WIDTH + H_GAP),
        y: HEADER + PAD + Math.floor(index / columns) * (NODE_HEIGHT + 16),
      });
    });
  }

  return { clusters, nodes };
}

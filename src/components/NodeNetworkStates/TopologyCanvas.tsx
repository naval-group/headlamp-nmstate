import { Box, GlobalStyles } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import {
  Background,
  BackgroundVariant,
  Controls,
  Edge,
  MiniMap,
  Node,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import React, { useCallback, useEffect, useMemo } from 'react';
import { interfaceMeta } from '../../nmstate/ifaceMeta';
import { Topology, TopologyNode } from '../../nmstate/topology';
import ClusterGroupNode, { ClusterGroupData } from './ClusterGroupNode';
import { collapsePodPorts, GROUP_PREFIX } from './collapse';
import InterfaceNode, { InterfaceNodeData } from './InterfaceNode';
import { placeTopology } from './layout';
import { scopedFlowCss, TOPOLOGY_SCOPE } from './scopedFlowStyles';

const nodeTypes = { iface: InterfaceNode, cluster: ClusterGroupNode };

export interface TopologyCanvasProps {
  topology: Topology;
  /** Only matching interfaces are drawn. */
  matches: (node: TopologyNode) => boolean;
  showPhantom: boolean;
  onSelect: (node: TopologyNode | null) => void;
  /** Bumped by the toolbar's fit-to-view button. */
  fitToken: number;
  /**
   * The overview is off by default: at this graph size it covers a corner of
   * the canvas while adding little, since the whole topology usually fits on
   * screen already.
   */
  showMiniMap: boolean;
  /** Controllers whose folded pod ports are currently shown. */
  expanded: Set<string>;
  onToggleExpanded: (controller: string) => void;
}

function Canvas({
  topology,
  matches,
  showPhantom,
  onSelect,
  fitToken,
  showMiniMap,
  expanded,
  onToggleExpanded,
}: TopologyCanvasProps) {
  const theme = useTheme();
  const { fitView } = useReactFlow();

  useEffect(() => {
    if (fitToken > 0) fitView({ duration: 300, padding: 0.1 });
  }, [fitToken, fitView]);

  const { nodes, edges } = useMemo(() => {
    /*
     * Filtering removes rather than dims. A greyed-out node still takes up its
     * slot and its edges still cross the canvas, so on a node carrying a dozen
     * interfaces a filter made the picture busier instead of clearer.
     */
    const visible = new Set(
      topology.nodes
        .filter(n => showPhantom || n.provenance !== 'phantom')
        .filter(matches)
        .map(n => n.id)
    );

    // Folding a bridge's pod ports keeps a busy node legible; see collapse.ts.
    const collapsed = collapsePodPorts(topology, visible, expanded);
    const present = new Set(collapsed.nodes.map(n => n.id));
    const effective: Topology = {
      ...topology,
      nodes: collapsed.nodes,
      edges: collapsed.edges,
      clusters: topology.clusters.map(cluster => ({
        ...cluster,
        nodes: [
          ...cluster.nodes.filter(id => present.has(id)),
          ...collapsed.nodes
            .filter(n => n.id.startsWith(GROUP_PREFIX) && n.cluster === cluster.id)
            .map(n => n.id),
        ],
      })),
    };

    const placement = placeTopology(effective, present);

    // React Flow requires a parent to appear before its children.
    const frames: Node<ClusterGroupData>[] = placement.clusters.map(cluster => {
      const meta = interfaceMeta(
        cluster.isolatedGroup
          ? 'unknown'
          : placement.nodes
              .filter(p => p.clusterId === cluster.id)
              .reduce((best, p) => (p.node.rank > best.node.rank ? p : best)).node.type
      );
      return {
        id: cluster.id,
        type: 'cluster',
        position: { x: cluster.x, y: cluster.y },
        style: { width: cluster.width, height: cluster.height },
        data: {
          label: cluster.label,
          count: cluster.count,
          color: cluster.isolatedGroup ? theme.palette.text.disabled : meta.color,
          icon: cluster.isolatedGroup ? 'mdi:shape-outline' : meta.icon,
        },
        draggable: false,
        selectable: false,
        zIndex: 0,
      };
    });

    const interfaces: Node<InterfaceNodeData>[] = placement.nodes.map(placed => ({
      id: placed.node.id,
      type: 'iface',
      parentId: placed.clusterId,
      extent: 'parent' as const,
      position: { x: placed.x, y: placed.y },
      data: { node: placed.node },
      draggable: true,
    }));

    const flowEdges: Edge[] = effective.edges.map(e => {
      const source = effective.nodes.find(n => n.id === e.source);
      const target = effective.nodes.find(n => n.id === e.target);
      const color = interfaceMeta(target?.type).color;
      // Pick the handles facing each other, so the line runs straight between
      // the two boxes whichever way round they ended up.
      const sourceAbove = (source?.rank ?? 0) < (target?.rank ?? 0);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: sourceAbove ? 'bottom' : 'top',
        targetHandle: sourceAbove ? 'top' : 'bottom',
        /* Orthogonal routing reads far better than curves on a layered
             graph: edges run in channels instead of sweeping across nodes. */
        type: 'smoothstep',
        pathOptions: { borderRadius: 12 },
        animated: e.kind === 'base-iface',
        style: {
          stroke: alpha(color, 0.75),
          strokeWidth: 1.5,
          strokeDasharray: e.kind === 'controller' ? '4 3' : undefined,
        },
        zIndex: 1,
      };
    });

    return { nodes: [...frames, ...interfaces], edges: flowEdges };
  }, [topology, showPhantom, matches, theme, expanded]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, n: Node) => {
      if (n.id.startsWith(GROUP_PREFIX)) {
        onToggleExpanded(n.id.slice(GROUP_PREFIX.length));
        return;
      }
      const data = n.data as InterfaceNodeData;
      if (data?.node) onSelect(data.node);
    },
    [onSelect, onToggleExpanded]
  );

  return (
    <Box
      className={TOPOLOGY_SCOPE}
      sx={{
        flex: 1,
        minWidth: 0,
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        overflow: 'hidden',
        backgroundColor: theme.palette.background.default,
      }}
    >
      <GlobalStyles styles={scopedFlowCss} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        onPaneClick={() => onSelect(null)}
        fitView
        fitViewOptions={{ padding: 0.1 }}
        minZoom={0.1}
        maxZoom={2}
        /*
         * The canvas sits inside a normally scrolling page, so the wheel must
         * keep scrolling that page: swallowing it to zoom traps the reader
         * every time they pass over the diagram. Zooming stays available
         * through pinch, ⌘/Ctrl + wheel, and the on-canvas controls, while
         * dragging the background still pans.
         */
        zoomOnScroll={false}
        panOnScroll={false}
        preventScrolling={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        panOnDrag
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} />
        <Controls showInteractive={false} />
        {showMiniMap && (
          <MiniMap
            pannable
            zoomable
            nodeStrokeWidth={3}
            nodeBorderRadius={4}
            nodeColor={n => interfaceMeta((n.data as InterfaceNodeData)?.node?.type).color}
            style={{ backgroundColor: theme.palette.background.paper, width: 150, height: 90 }}
          />
        )}
      </ReactFlow>
    </Box>
  );
}

/** React Flow needs its provider above any component calling its hooks. */
export default function TopologyCanvas(props: TopologyCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

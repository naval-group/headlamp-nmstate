import { Icon } from '@iconify/react';
import { Box, Chip, Tooltip, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import { Handle, Position } from '@xyflow/react';
import React from 'react';
import { interfaceMeta, PROVENANCE, stateColor } from '../../nmstate/ifaceMeta';
import { TopologyNode } from '../../nmstate/topology';
import { NODE_HEIGHT, NODE_WIDTH } from './layout';

export interface InterfaceNodeData extends Record<string, unknown> {
  node: TopologyNode;
}

/**
 * One interface rendered on the topology canvas.
 *
 * Provenance is the thing users scan the canvas for — which interfaces a policy
 * owns, and which of those are broken — so it gets a full-height colour bar and
 * a labelled badge rather than a thin border that reads as decoration.
 */
function InterfaceNodeComponent({
  data,
  selected,
}: {
  data: InterfaceNodeData;
  selected?: boolean;
}) {
  const theme = useTheme();
  const { node } = data;
  const meta = interfaceMeta(node.type);
  const prov = PROVENANCE[node.provenance];
  const isPhantom = node.provenance === 'phantom';
  const isDeclared = node.provenance === 'managed' || node.provenance === 'failing';

  return (
    <Box
      sx={{
        width: NODE_WIDTH,
        minHeight: NODE_HEIGHT,
        display: 'flex',
        borderRadius: 1.5,
        overflow: 'hidden',
        border: '1px solid',
        borderColor: selected ? meta.color : alpha(meta.color, 0.45),
        borderStyle: isPhantom ? 'dashed' : 'solid',
        backgroundColor: theme.palette.background.paper,
        backgroundImage: `linear-gradient(${alpha(meta.color, 0.1)}, ${alpha(meta.color, 0.02)})`,
        boxShadow: selected
          ? `0 0 0 2px ${alpha(meta.color, 0.5)}`
          : isDeclared
          ? `0 0 0 1px ${alpha(prov.color, 0.5)}`
          : theme.shadows[1],
        transition: 'box-shadow 150ms',
        cursor: 'pointer',
      }}
    >
      {/*
        Both ends carry a handle top and bottom. Since the diagram is oriented
        by role, an interface's neighbour can sit either above or below it, and
        a single fixed handle made edges leave through the top of the node and
        loop back around — a stray wire above the physical interfaces.
      */}
      <Handle id="top" type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle id="top" type="source" position={Position.Top} style={{ opacity: 0 }} />
      <Handle id="bottom" type="source" position={Position.Bottom} style={{ opacity: 0 }} />

      {/* Provenance bar: full height so it reads as a property of the node. */}
      <Tooltip title={`${prov.label} — ${prov.description}`}>
        <Box
          sx={{
            width: 8,
            flexShrink: 0,
            backgroundColor: prov.color,
            opacity: node.provenance === 'observed' ? 0.35 : 1,
          }}
        />
      </Tooltip>

      <Box sx={{ flex: 1, minWidth: 0, px: 1.25, py: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
          <Icon icon={meta.icon} width={18} height={18} color={meta.color} />
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}
            noWrap
            title={node.name}
          >
            {node.name}
          </Typography>
          <Tooltip title={`State: ${node.state}`}>
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: stateColor(node.state),
                flexShrink: 0,
              }}
            />
          </Tooltip>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap', mb: 0.25 }}>
          <Chip
            label={meta.label}
            size="small"
            sx={{
              height: 18,
              fontSize: '0.65rem',
              backgroundColor: alpha(meta.color, 0.18),
              color: theme.palette.text.primary,
            }}
          />
          {node.mtu ? (
            <Typography variant="caption" color="text.secondary">
              MTU {node.mtu}
            </Typography>
          ) : null}
        </Box>

        {/* Managed and failing are called out by name; the policy is what the
            user needs in order to act on what they are looking at. */}
        {isDeclared && (
          <Tooltip title={node.failureMessage || `Declared by policy ${node.policy ?? ''}`}>
            <Chip
              size="small"
              icon={<Icon icon={prov.icon} width={12} />}
              label={node.policy ? `${prov.label} · ${node.policy}` : prov.label}
              sx={{
                height: 18,
                maxWidth: '100%',
                fontSize: '0.65rem',
                fontWeight: 600,
                mb: 0.25,
                color: prov.color,
                backgroundColor: alpha(prov.color, 0.16),
                '& .MuiChip-icon': { color: prov.color },
              }}
            />
          </Tooltip>
        )}

        {node.addresses.length > 0 && (
          <Typography
            variant="caption"
            sx={{ display: 'block', fontFamily: 'monospace' }}
            noWrap
            title={node.addresses.join(', ')}
          >
            {node.addresses[0]}
            {node.addresses.length > 1 ? ` +${node.addresses.length - 1}` : ''}
          </Typography>
        )}

        {node.collapsed ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            click to expand
          </Typography>
        ) : isPhantom ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
            not reported
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

export default React.memo(InterfaceNodeComponent);

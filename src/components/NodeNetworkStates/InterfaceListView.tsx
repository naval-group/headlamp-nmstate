import { Icon } from '@iconify/react';
import { Link } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Divider,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import * as yaml from 'js-yaml';
import React, { useMemo } from 'react';
import { interfaceMeta, PROVENANCE, stateColor, typeRank } from '../../nmstate/ifaceMeta';
import { Topology, TopologyNode } from '../../nmstate/topology';
import NmstateLogView from '../common/NmstateLogView';
import InterfaceFacts from './InterfaceFacts';

interface Props {
  topology: Topology;
  matches: (node: TopologyNode) => boolean;
  showPhantom: boolean;
}

/**
 * The textual counterpart of the topology canvas.
 *
 * The map answers "how is this wired"; this answers "what exactly is on this
 * node", which is the question you have when comparing two nodes or copying a
 * value out. Interfaces are grouped by type so related ones read together, and
 * unlike the canvas this view filters rather than dims — there are no edges to
 * preserve context for.
 */
export default function InterfaceListView({ topology, matches, showPhantom }: Props) {
  const grouped = useMemo(() => {
    const visible = topology.nodes
      .filter(n => showPhantom || n.provenance !== 'phantom')
      .filter(matches);

    const byType = new Map<string, TopologyNode[]>();
    for (const node of visible) {
      if (!byType.has(node.type)) byType.set(node.type, []);
      byType.get(node.type)?.push(node);
    }
    for (const list of byType.values()) list.sort((a, b) => a.name.localeCompare(b.name));

    return [...byType.entries()].sort(
      (a, b) => typeRank(a[0]) - typeRank(b[0]) || a[0].localeCompare(b[0])
    );
  }, [topology, matches, showPhantom]);

  const total = grouped.reduce((n, [, list]) => n + list.length, 0);

  if (total === 0) {
    return (
      <Alert severity="info" variant="filled">
        No interface matches the current filters.
      </Alert>
    );
  }

  return (
    /* No inner scroll container: the list flows with the page, so reading it
       is one continuous scroll rather than a scroll inside a scroll. */
    <Box>
      {grouped.map(([type, list]) => {
        const meta = interfaceMeta(type);
        return (
          <Box key={type} sx={{ mb: 2 }}>
            <Divider textAlign="left" sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Icon icon={meta.icon} width={16} color={meta.color} />
                <Typography variant="caption" sx={{ fontWeight: 600 }}>
                  {meta.label}
                </Typography>
                <Chip size="small" label={list.length} sx={{ height: 16, fontSize: '0.6rem' }} />
              </Box>
            </Divider>

            {list.map(node => {
              const prov = PROVENANCE[node.provenance];
              const isDeclared = node.provenance === 'managed' || node.provenance === 'failing';
              return (
                <Accordion
                  key={node.id}
                  disableGutters
                  variant="outlined"
                  sx={{
                    '&:before': { display: 'none' },
                    borderLeft: `4px solid ${prov.color}`,
                    mb: 0.5,
                  }}
                >
                  <AccordionSummary expandIcon={<Icon icon="mdi:chevron-down" width={20} />}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        width: '100%',
                        minWidth: 0,
                      }}
                    >
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
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {node.name}
                      </Typography>
                      {isDeclared && (
                        <Chip
                          size="small"
                          icon={<Icon icon={prov.icon} width={12} />}
                          label={node.policy ? `${prov.label} · ${node.policy}` : prov.label}
                          sx={{
                            height: 18,
                            fontSize: '0.65rem',
                            color: prov.color,
                            backgroundColor: alpha(prov.color, 0.16),
                            '& .MuiChip-icon': { color: prov.color },
                          }}
                        />
                      )}
                      <Box sx={{ flex: 1 }} />
                      {node.addresses.length > 0 && (
                        <Typography variant="caption" sx={{ fontFamily: 'monospace' }} noWrap>
                          {node.addresses.join(', ')}
                        </Typography>
                      )}
                      {node.mtu ? (
                        <Typography variant="caption" color="text.secondary">
                          MTU {node.mtu}
                        </Typography>
                      ) : null}
                    </Box>
                  </AccordionSummary>
                  <AccordionDetails>
                    {node.provenance === 'failing' && node.failureMessage && (
                      <>
                        <Alert severity="error" variant="filled" sx={{ mb: 1 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word',
                              fontWeight: 600,
                            }}
                          >
                            {node.failureMessage}
                          </Typography>
                        </Alert>
                        {node.failureDetail && (
                          <Box sx={{ mb: 1 }}>
                            <NmstateLogView log={node.failureDetail} maxHeight={220} />
                          </Box>
                        )}
                      </>
                    )}
                    {node.provenance === 'phantom' && (
                      <Alert severity="info" variant="filled" sx={{ mb: 1 }}>
                        <Typography variant="caption">{PROVENANCE.phantom.description}</Typography>
                      </Alert>
                    )}
                    {node.policy && (
                      <Box sx={{ display: 'flex', gap: 1, py: 0.35, alignItems: 'center' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 110 }}>
                          Declared by
                        </Typography>
                        <Link routeName="nncp" params={{ name: node.policy }}>
                          <Typography variant="caption">{node.policy}</Typography>
                        </Link>
                      </Box>
                    )}
                    <InterfaceFacts node={node} />
                    {node.iface && (
                      <Box
                        component="pre"
                        sx={{
                          mt: 1,
                          mb: 0,
                          p: 1,
                          fontSize: '0.68rem',
                          overflowX: 'auto',
                          maxHeight: 300,
                          backgroundColor: 'action.hover',
                          borderRadius: 1,
                        }}
                      >
                        {yaml.dump(node.iface, { lineWidth: -1, noRefs: true })}
                      </Box>
                    )}
                  </AccordionDetails>
                </Accordion>
              );
            })}
          </Box>
        );
      })}
    </Box>
  );
}

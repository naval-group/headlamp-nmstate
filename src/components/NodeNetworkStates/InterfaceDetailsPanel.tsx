import { Icon } from '@iconify/react';
import { Link } from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AlertTitle,
  Box,
  Chip,
  Divider,
  IconButton,
  Paper,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import * as yaml from 'js-yaml';
import React from 'react';
import { interfaceMeta, PROVENANCE, stateColor } from '../../nmstate/ifaceMeta';
import { TopologyNode } from '../../nmstate/topology';
import NmstateLogView from '../common/NmstateLogView';
import InterfaceFacts from './InterfaceFacts';

interface Props {
  node: TopologyNode;
  onClose: () => void;
}

/** Side panel detailing the interface selected on the canvas. */
export default function InterfaceDetailsPanel({ node, onClose }: Props) {
  const meta = interfaceMeta(node.type);
  const prov = PROVENANCE[node.provenance];
  const iface = node.iface;

  return (
    <Paper
      variant="outlined"
      sx={{ width: 330, flexShrink: 0, overflowY: 'auto', borderTop: `3px solid ${meta.color}` }}
    >
      <Box sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Icon icon={meta.icon} width={22} color={meta.color} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap title={node.name}>
              {node.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {meta.label}
            </Typography>
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Close details">
            <Icon icon="mdi:close" width={18} />
          </IconButton>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
          <Chip
            size="small"
            label={node.state}
            sx={{ height: 20, backgroundColor: alpha(stateColor(node.state), 0.2) }}
          />
          <Chip
            size="small"
            icon={<Icon icon={prov.icon} width={13} />}
            label={prov.label}
            sx={{ height: 20, backgroundColor: alpha(prov.color, 0.18) }}
          />
        </Box>

        {node.provenance === 'failing' && node.failureMessage && (
          <Alert severity="error" variant="filled" sx={{ mb: 1 }}>
            <AlertTitle sx={{ fontSize: '0.8rem' }}>
              Enactment failing
              {node.policy ? (
                <>
                  {' — '}
                  <Link routeName="nncp" params={{ name: node.policy }}>
                    {node.policy}
                  </Link>
                </>
              ) : null}
            </AlertTitle>
            <Typography
              variant="caption"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 600 }}
            >
              {node.failureMessage}
            </Typography>
          </Alert>
        )}

        {node.failureDetail && (
          <Accordion
            disableGutters
            variant="outlined"
            sx={{ mb: 1, '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<Icon icon="mdi:chevron-down" width={20} />}>
              <Typography variant="caption">Apply log</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <NmstateLogView log={node.failureDetail} maxHeight={260} />
            </AccordionDetails>
          </Accordion>
        )}

        {node.provenance === 'managed' && node.policy && (
          <Alert severity="info" variant="filled" sx={{ mb: 1 }}>
            <Typography variant="caption">
              Declared by policy{' '}
              <Link routeName="nncp" params={{ name: node.policy }}>
                <strong>{node.policy}</strong>
              </Link>
            </Typography>
          </Alert>
        )}

        {node.provenance === 'phantom' && (
          <Alert severity="info" variant="filled" sx={{ mb: 1 }}>
            <Typography variant="caption">{PROVENANCE.phantom.description}</Typography>
          </Alert>
        )}

        <Divider sx={{ my: 1 }} />

        <InterfaceFacts node={node} />

        {iface && (
          <Accordion
            disableGutters
            variant="outlined"
            sx={{ mt: 1, '&:before': { display: 'none' } }}
          >
            <AccordionSummary expandIcon={<Icon icon="mdi:chevron-down" width={20} />}>
              <Typography variant="caption">Raw interface state</Typography>
            </AccordionSummary>
            <AccordionDetails sx={{ p: 0 }}>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 1,
                  fontSize: '0.68rem',
                  overflowX: 'auto',
                  maxHeight: 320,
                  backgroundColor: 'action.hover',
                }}
              >
                {yaml.dump(iface, { lineWidth: -1, noRefs: true })}
              </Box>
            </AccordionDetails>
          </Accordion>
        )}
      </Box>
    </Paper>
  );
}

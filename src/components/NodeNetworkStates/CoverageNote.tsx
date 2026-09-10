import { Icon } from '@iconify/react';
import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import React from 'react';

/**
 * Explains the gap between what the node actually has and what is shown.
 *
 * A NodeNetworkState is materially smaller than `ip link` output — on a busy
 * worker, 79 kernel interfaces can surface as 12 — and routes are similarly
 * partial. Without saying so, the page looks like it is failing to display
 * things. Both gaps come from upstream, so the honest move is to name them
 * rather than to imply completeness.
 */
export default function CoverageNote({
  filteredPorts,
  reportedInterfaces,
}: {
  filteredPorts: number;
  reportedInterfaces: number;
}) {
  return (
    <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
      <AccordionSummary expandIcon={<Icon icon="mdi:chevron-down" width={20} />}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Icon icon="mdi:information-outline" width={18} />
          <Typography variant="body2">
            Why this shows {reportedInterfaces} interfaces and not every one on the node
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Typography variant="body2" component="div">
          <p>
            This page shows exactly what the NodeNetworkState reports, and nmstate reports less than
            the kernel has. Two things are dropped before it ever reaches Headlamp:
          </p>
          <ul>
            <li>
              <strong>Unmanaged veth interfaces are dropped by the nmstate handler.</strong> The
              rule is precise: an interface is filtered only when it is of type <code>veth</code>{' '}
              <em>and</em> NetworkManager is not managing it. Every pod on the node has such a veth,
              so on a busy worker this is most of the interface list — 65 of 77 on a measured node.
              A veth that NetworkManager does manage stays visible. Filtered ones still appear here
              as bridge ports when a bridge references them
              {filteredPorts > 0 ? ` (${filteredPorts} on this node)` : ''}, marked as filtered.
            </li>
            <li>
              <strong>WireGuard interfaces are invisible to nmstate itself.</strong> Interfaces such
              as <code>wg0</code> and <code>cilium_wg0</code> are not modelled by the library
              nmstate reads the kernel with, so nothing downstream can show them.
            </li>
          </ul>
          <p>
            Routes follow from that: a route is kept only when its next-hop interface survived the
            interface filter, and nmstate reports the routes it manages rather than the full kernel
            routing table. A node whose traffic leaves through one gateway will legitimately show a
            single route here.
          </p>
        </Typography>
      </AccordionDetails>
    </Accordion>
  );
}

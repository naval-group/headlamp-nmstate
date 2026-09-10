import { Icon } from '@iconify/react';
import { Box, Chip, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import React from 'react';
import { NodeNetworkState } from '../../nmstate/resources';

/** Thresholds, in seconds, past which the age is worth pointing out. */
const NOTABLE = 60 * 60;
const OLD = 12 * 3600;

function humanise(seconds: number): string {
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 90 * 60) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 48 * 3600) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86400)}d ago`;
}

/**
 * Shows when the node's network state last changed.
 *
 * The handler re-reads each node on a jittered interval but only rewrites the
 * object when the state differs from what it last saw, so this timestamp is the
 * moment the network last changed — not the moment it was last checked. An age
 * of hours therefore means a stable node, which is why it is presented as
 * information rather than as a warning.
 */
export default function SnapshotAge({ nns }: { nns: NodeNetworkState }) {
  const age = nns.getSnapshotAgeSeconds();

  if (age === null) {
    return <Chip size="small" label="never reported" sx={{ height: 20 }} variant="outlined" />;
  }

  const color = age > OLD ? '#607d8b' : age > NOTABLE ? '#78909c' : '#4caf50';
  const icon = 'mdi:clock-outline';

  return (
    <Tooltip
      title={
        <Box>
          <div>State last changed: {nns.lastUpdate}</div>
          <div>
            The handler re-reads this node regularly and only records a new snapshot when something
            differs, so an older timestamp means a stable network rather than missing data.
          </div>
        </Box>
      }
    >
      <Chip
        size="small"
        icon={<Icon icon={icon} width={13} />}
        label={humanise(age)}
        sx={{ height: 20, backgroundColor: alpha(color, 0.18), borderLeft: `3px solid ${color}` }}
      />
    </Tooltip>
  );
}

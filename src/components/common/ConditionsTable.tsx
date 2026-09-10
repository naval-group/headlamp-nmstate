import { Box, Chip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import React from 'react';
import { NmstateCondition } from '../../nmstate/types';
import { policyStatusColor } from '../Policies/status';

const cellSx = { p: 1, borderBottom: '1px solid', borderColor: 'divider' } as const;
const headerSx = { ...cellSx, textAlign: 'left' } as const;

interface Props {
  conditions: NmstateCondition[] | undefined | null;
}

/**
 * Renders the condition set of a policy or enactment.
 *
 * A condition being True is not inherently good news here: `Failing: True` and
 * `Available: True` mean opposite things, so the chip takes its colour from the
 * condition type rather than from the boolean.
 */
export default function ConditionsTable({ conditions }: Props) {
  if (!conditions || conditions.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No conditions reported.
      </Typography>
    );
  }

  return (
    <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
      <Box component="thead">
        <Box component="tr">
          {['Type', 'Status', 'Reason', 'Message', 'Last transition'].map(h => (
            <Box key={h} component="th" sx={headerSx}>
              <Typography variant="caption" color="text.secondary">
                {h}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
      <Box component="tbody">
        {conditions.map(c => {
          const active = c.status === 'True';
          const color = policyStatusColor(c.type);
          return (
            <Box
              component="tr"
              key={c.type}
              sx={{
                opacity: active ? 1 : 0.55,
                backgroundColor: active ? alpha(color, 0.07) : undefined,
              }}
            >
              <Box component="td" sx={cellSx}>
                <Typography variant="body2" sx={{ fontWeight: active ? 600 : 400 }}>
                  {c.type}
                </Typography>
              </Box>
              <Box component="td" sx={cellSx}>
                <Chip
                  label={c.status}
                  size="small"
                  sx={{
                    height: 20,
                    ...(active && {
                      borderLeft: `3px solid ${color}`,
                      borderRadius: 0.5,
                      backgroundColor: alpha(color, 0.18),
                    }),
                  }}
                />
              </Box>
              <Box component="td" sx={cellSx}>
                <Typography variant="body2">{c.reason || '—'}</Typography>
              </Box>
              <Box component="td" sx={{ ...cellSx, maxWidth: 480 }}>
                <Typography
                  variant="body2"
                  sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {c.message || '—'}
                </Typography>
              </Box>
              <Box component="td" sx={cellSx}>
                <Typography variant="body2" color="text.secondary">
                  {c.lastTransitionTime ? new Date(c.lastTransitionTime).toLocaleString() : '—'}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

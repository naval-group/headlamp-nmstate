import { Icon } from '@iconify/react';
import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import React from 'react';

export interface ClusterGroupData extends Record<string, unknown> {
  label: string;
  count: number;
  color: string;
  icon: string;
}

/**
 * The frame drawn around one connected stack of interfaces.
 *
 * Its only job is to make the boundary between unrelated stacks obvious, so it
 * stays deliberately quiet: a tinted outline and a caption, nothing that
 * competes with the interfaces inside it.
 */
function ClusterGroupNodeComponent({ data }: { data: ClusterGroupData }) {
  const theme = useTheme();
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        borderRadius: 2,
        border: '1px solid',
        borderColor: alpha(data.color, 0.35),
        backgroundColor: alpha(data.color, theme.palette.mode === 'dark' ? 0.06 : 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.25, pt: 0.75 }}>
        <Icon icon={data.icon} width={15} color={data.color} />
        <Typography variant="caption" sx={{ fontWeight: 600, color: data.color }}>
          {data.label}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {data.count} interface{data.count > 1 ? 's' : ''}
        </Typography>
      </Box>
    </Box>
  );
}

export default React.memo(ClusterGroupNodeComponent);

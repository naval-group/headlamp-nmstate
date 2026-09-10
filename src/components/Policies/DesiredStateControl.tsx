import { Box, ButtonBase, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import React from 'react';

export const INTERFACE_STATES = ['up', 'down', 'absent', 'ignore'] as const;
export type InterfaceStateValue = (typeof INTERFACE_STATES)[number];

interface StateStyle {
  color: string;
  help: string;
  /** Diagonal hatching, used where a flat colour would imply a status. */
  striped?: boolean;
}

const STATES: Record<InterfaceStateValue, StateStyle> = {
  up: { color: '#1faa3d', help: 'Bring the interface up and keep it configured.' },
  down: { color: '#e02020', help: 'Keep the interface configured but administratively down.' },
  absent: {
    color: '#5a5a5a',
    help: 'Remove the interface from the node. This is the only way a policy deletes anything.',
  },
  ignore: {
    color: '#9e9e9e',
    help: 'Leave the interface exactly as it is; the policy neither configures nor removes it.',
    striped: true,
  },
};

/**
 * The interface's desired state, as one control that never moves.
 *
 * State decides whether a policy creates, leaves alone or deletes, so it sits
 * immediately under the type at full width on every interface type, and the
 * chosen segment is a flat block of colour rather than a tint.
 *
 * Built from ButtonBase rather than MUI's ToggleButtonGroup on purpose. That
 * component ships a `.MuiToggleButton-root.Mui-selected` rule carrying its own
 * backgroundColor, which has the same specificity as anything `sx` can emit —
 * two classes — so which one wins comes down to Emotion's injection order, and
 * it did not come down our way. Owning the markup removes the contest instead
 * of trying to out-specify it.
 */
export default function DesiredStateControl({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: InterfaceStateValue) => void;
}) {
  const theme = useTheme();
  const current = (value || 'up') as InterfaceStateValue;

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        Desired state
      </Typography>
      <Box
        role="radiogroup"
        aria-label="Desired state"
        sx={{
          display: 'flex',
          mt: 0.5,
          borderRadius: 1,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: alpha(theme.palette.text.primary, 0.15),
        }}
      >
        {INTERFACE_STATES.map((state, index) => {
          const style = STATES[state];
          const selected = current === state;
          const stripes = `repeating-linear-gradient(45deg, ${alpha(
            style.color,
            selected ? 0.85 : 0.08
          )} 0 8px, ${selected ? style.color : 'transparent'} 8px 16px)`;

          return (
            <ButtonBase
              key={state}
              role="radio"
              aria-checked={selected}
              title={style.help}
              onClick={() => onChange(state)}
              sx={{
                // ButtonBase is deliberately unstyled and, unlike ToggleButton,
                // applies none of the theme's typography — without this the
                // segments fall back to the browser's default serif.
                ...theme.typography.button,
                flex: 1,
                py: 1,
                fontSize: '0.9rem',
                fontWeight: selected ? 700 : 500,
                letterSpacing: selected ? '0.05em' : undefined,
                textTransform: 'none',
                borderLeft: index === 0 ? 'none' : '1px solid',
                borderColor: alpha(theme.palette.text.primary, 0.15),
                color: selected
                  ? style.striped
                    ? '#000'
                    : '#fff'
                  : alpha(theme.palette.text.primary, 0.45),
                background: style.striped
                  ? stripes
                  : selected
                  ? style.color
                  : alpha(style.color, 0.06),
                transition: 'background 120ms, color 120ms',
                '&:hover': {
                  background: style.striped
                    ? stripes
                    : selected
                    ? style.color
                    : alpha(style.color, 0.2),
                },
              }}
            >
              {state}
            </ButtonBase>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary">
        {STATES[current].help}
      </Typography>
    </Box>
  );
}

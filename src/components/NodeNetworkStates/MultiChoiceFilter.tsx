import { Icon } from '@iconify/react';
import {
  Box,
  Button,
  Checkbox,
  Divider,
  ListItemText,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import React from 'react';

export interface Choice {
  value: string;
  label: string;
  /** Rendered before the label, such as a type icon or a state dot. */
  adornment?: React.ReactNode;
  count?: number;
}

interface Props {
  label: string;
  choices: Choice[];
  /** Enabled values; null means every choice is enabled. */
  selected: Set<string> | null;
  onChange: (selected: Set<string> | null) => void;
  minWidth?: number;
}

/**
 * A filter that starts with everything enabled and is narrowed by unticking.
 *
 * Holding `null` for "everything" rather than a full set matters: the choices
 * come from the data, which arrives after the first render, and a set built too
 * early would silently exclude whatever loaded later. It also keeps the
 * distinction between a filter nobody has touched and one that happens to have
 * every box ticked.
 */
export default function MultiChoiceFilter({
  label,
  choices,
  selected,
  onChange,
  minWidth = 160,
}: Props) {
  const all = choices.map(c => c.value);
  const isOn = (value: string) => selected === null || selected.has(value);
  const activeCount = selected === null ? all.length : all.filter(v => selected.has(v)).length;

  const toggle = (value: string) => {
    const next = new Set(selected === null ? all : selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    // Back to every box ticked is the same as no filter at all.
    onChange(next.size === all.length ? null : next);
  };

  return (
    <TextField
      select
      size="small"
      value={[]}
      sx={{ minWidth }}
      SelectProps={{
        multiple: true,
        displayEmpty: true,
        renderValue: () => (
          <Typography variant="body2">
            {activeCount === all.length
              ? `All ${label.toLowerCase()}`
              : `${activeCount} of ${all.length} ${label.toLowerCase()}`}
          </Typography>
        ),
        MenuProps: { PaperProps: { sx: { maxHeight: 420 } } },
      }}
    >
      <Box sx={{ display: 'flex', gap: 0.5, px: 1, pb: 0.5 }}>
        <Button size="small" onClick={() => onChange(null)} disabled={selected === null}>
          Select all
        </Button>
        <Button
          size="small"
          onClick={() => onChange(new Set())}
          disabled={selected !== null && selected.size === 0}
        >
          Clear
        </Button>
      </Box>
      <Divider />
      {choices.map(choice => (
        <MenuItem
          key={choice.value}
          value={choice.value}
          onClick={() => toggle(choice.value)}
          sx={{ py: 0.25 }}
        >
          <Checkbox size="small" checked={isOn(choice.value)} sx={{ mr: 0.5 }} />
          {choice.adornment}
          <ListItemText primary={choice.label} sx={{ ml: choice.adornment ? 1 : 0 }} />
          {choice.count !== undefined && (
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {choice.count}
            </Typography>
          )}
        </MenuItem>
      ))}
      {choices.length === 0 && (
        <MenuItem disabled>
          <Icon icon="mdi:filter-off-outline" width={16} />
          <ListItemText primary="Nothing to filter" sx={{ ml: 1 }} />
        </MenuItem>
      )}
    </TextField>
  );
}

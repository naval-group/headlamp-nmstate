import { Icon } from '@iconify/react';
import {
  Autocomplete,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Paper,
  Popover,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useMemo, useState } from 'react';
import { PropertySpec } from './bondOptions';

interface Props {
  /** Every option that may be set, already filtered to what applies here. */
  available: PropertySpec[];
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
  /** Values offered for specs marked `suggestFrom: 'members'`. */
  members?: string[];
  /** Returns why a key cannot currently be set, if anything. */
  conflict?: (key: string, values: Record<string, unknown>) => string | null;
  addLabel?: string;
  emptyHint?: string;
}

/**
 * Adds settings one at a time from a catalogue, rather than showing them all.
 *
 * A bond has well over twenty options and most configurations use two or three,
 * so laying them all out buries the handful that matter in a wall of empty
 * fields. Choosing a property first also means the control can be the right one
 * for that property — a list of documented values, a bounded number, a
 * toggle — with its explanation attached, instead of a uniform text box.
 */
export default function PropertyEditor({
  available,
  values,
  onChange,
  members = [],
  conflict,
  addLabel = 'Add config property',
  emptyHint,
}: Props) {
  const set = (key: string, value: unknown) => onChange({ ...values, [key]: value });

  const remove = (key: string) => {
    const next = { ...values };
    delete next[key];
    onChange(next);
  };

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [search, setSearch] = useState('');
  const [hovered, setHovered] = useState<PropertySpec | null>(null);

  const bySpec = new Map(available.map(spec => [spec.key, spec]));
  const active = Object.keys(values).filter(key => values[key] !== undefined);
  const unset = available.filter(spec => !(spec.key in values));

  const matching = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return unset;
    return unset.filter(
      spec =>
        spec.label.toLowerCase().includes(q) ||
        spec.key.toLowerCase().includes(q) ||
        spec.help.toLowerCase().includes(q)
    );
  }, [unset, search]);

  return (
    <Box>
      {active.length === 0 && emptyHint && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {emptyHint}
        </Typography>
      )}

      {active.map(key => {
        const spec = bySpec.get(key);
        const blocked = conflict?.(key, values) ?? null;

        // A value already set for an option the current mode rejects: worth
        // showing rather than hiding, so it can be removed rather than silently
        // travelling with the policy.
        if (!spec) {
          return (
            <Paper
              key={key}
              variant="outlined"
              sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center' }}
            >
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {key}: {String(values[key])}
                </Typography>
                <Typography variant="caption" color="warning.main">
                  Not valid for this bond mode
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => remove(key)} aria-label={`Remove ${key}`}>
                <Icon icon="mdi:close" width={18} />
              </IconButton>
            </Paper>
          );
        }

        const value = values[key];
        const numberError =
          spec.kind === 'number' && value !== undefined && value !== ''
            ? (spec.min !== undefined && Number(value) < spec.min) ||
              (spec.max !== undefined && Number(value) > spec.max)
            : false;
        const stringError =
          spec.kind === 'string' && spec.validate ? spec.validate(String(value ?? '')) : null;
        const choiceHelp = spec.choices?.find(c => c.value === value)?.help;

        return (
          <Paper
            key={key}
            variant="outlined"
            sx={{
              p: 1.25,
              mb: 1,
              ...(blocked && {
                borderColor: 'warning.main',
                backgroundColor: alpha('#ff9800', 0.06),
              }),
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Box sx={{ flex: '0 0 190px', pt: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {spec.label}
                  </Typography>
                  <Tooltip title={spec.help}>
                    <Box sx={{ display: 'flex', color: 'text.secondary' }}>
                      <Icon icon="mdi:information-outline" width={15} />
                    </Box>
                  </Tooltip>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ fontFamily: 'monospace' }}
                >
                  {spec.key}
                </Typography>
              </Box>

              <Box sx={{ flex: 1, minWidth: 0 }}>
                {spec.kind === 'enum' && (
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={(value as string) ?? ''}
                    onChange={e => set(key, e.target.value)}
                    /* Only the value in the closed field: the explanation lives
                       under it, and rendering both made every row say the same
                       sentence twice. */
                    SelectProps={{
                      renderValue: selected => (
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {selected as string}
                        </Typography>
                      ),
                    }}
                  >
                    {spec.choices?.map(choice => (
                      <MenuItem key={choice.value} value={choice.value} sx={{ display: 'block' }}>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                          {choice.value}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', whiteSpace: 'normal' }}
                        >
                          {choice.help}
                        </Typography>
                      </MenuItem>
                    ))}
                  </TextField>
                )}

                {spec.kind === 'number' && (
                  <TextField
                    fullWidth
                    size="small"
                    type="number"
                    value={value === undefined ? '' : String(value)}
                    error={numberError}
                    inputProps={{ min: spec.min, max: spec.max }}
                    onChange={e =>
                      set(key, e.target.value === '' ? undefined : Number(e.target.value))
                    }
                    helperText={
                      numberError
                        ? `Must be between ${spec.min ?? 0} and ${spec.max ?? '∞'}`
                        : undefined
                    }
                  />
                )}

                {spec.kind === 'string' &&
                  (spec.suggestFrom === 'members' ? (
                    <Autocomplete
                      freeSolo
                      fullWidth
                      size="small"
                      options={members.filter(Boolean)}
                      value={(value as string) ?? ''}
                      onInputChange={(_, v) => set(key, v)}
                      renderInput={params => (
                        <TextField {...params} placeholder={spec.placeholder} />
                      )}
                    />
                  ) : (
                    <TextField
                      fullWidth
                      size="small"
                      value={(value as string) ?? ''}
                      placeholder={spec.placeholder}
                      error={Boolean(stringError)}
                      helperText={stringError || undefined}
                      onChange={e => set(key, e.target.value)}
                    />
                  ))}

                {spec.kind === 'boolean' && (
                  <FormControlLabel
                    sx={{ ml: 0 }}
                    control={
                      <Switch
                        size="small"
                        checked={Boolean(value)}
                        onChange={e => set(key, e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2">{value ? 'Enabled' : 'Disabled'}</Typography>
                    }
                  />
                )}

                {choiceHelp && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: 'block', mt: 0.5 }}
                  >
                    {choiceHelp}
                  </Typography>
                )}
                {blocked && (
                  <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                    {blocked}
                  </Typography>
                )}
              </Box>

              <IconButton
                size="small"
                onClick={() => remove(key)}
                aria-label={`Remove ${spec.label}`}
                sx={{ mt: 0.25 }}
              >
                <Icon icon="mdi:close" width={18} />
              </IconButton>
            </Box>
          </Paper>
        );
      })}

      {unset.length > 0 && (
        <>
          <Button
            size="small"
            startIcon={<Icon icon="mdi:plus" width={16} />}
            endIcon={<Icon icon="mdi:chevron-down" width={16} />}
            onClick={e => {
              setSearch('');
              setHovered(null);
              setAnchor(e.currentTarget);
            }}
          >
            {addLabel}
          </Button>

          {/*
            A list of two dozen options with a sentence each becomes a menu
            taller than the window. A compact grid with a search box shows them
            all at once instead, and the full description stays a hover away.
          */}
          <Popover
            open={Boolean(anchor)}
            anchorEl={anchor}
            onClose={() => setAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            slotProps={{ paper: { sx: { width: 620, maxWidth: '90vw' } } }}
          >
            <Box sx={{ p: 1.25, pb: 0.5 }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Search options…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Icon icon="mdi:magnify" width={18} />
                    </InputAdornment>
                  ),
                }}
              />
            </Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 0.5,
                p: 1.25,
                pt: 0.75,
                maxHeight: '55vh',
                overflowY: 'auto',
              }}
            >
              {matching.length === 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>
                  No option matches “{search}”.
                </Typography>
              )}
              {matching.map(spec => (
                <Box
                  key={spec.key}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setHovered(spec)}
                  onFocus={() => setHovered(spec)}
                  onClick={() => {
                    // Seed with the first documented value so the row is
                    // never invalid the moment it appears.
                    set(
                      spec.key,
                      spec.kind === 'enum'
                        ? spec.choices?.[0]?.value
                        : spec.kind === 'boolean'
                        ? false
                        : ''
                    );
                    setAnchor(null);
                  }}
                  onKeyDown={e => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    set(
                      spec.key,
                      spec.kind === 'enum'
                        ? spec.choices?.[0]?.value
                        : spec.kind === 'boolean'
                        ? false
                        : ''
                    );
                    setAnchor(null);
                  }}
                  sx={{
                    p: 1,
                    borderRadius: 1,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: 'divider',
                    '&:hover, &:focus-visible': { backgroundColor: 'action.hover' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {spec.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontFamily: 'monospace', display: 'block' }}
                    noWrap
                  >
                    {spec.key}
                  </Typography>
                </Box>
              ))}
            </Box>

            {/*
              The description sits in a fixed panel rather than a tooltip. A
              tooltip covers the grid it describes, so moving the pointer up to
              read an option higher in the list lands on the tooltip instead of
              on the option.
            */}
            <Box
              sx={{
                px: 1.5,
                py: 1.25,
                minHeight: 62,
                borderTop: '1px solid',
                borderColor: 'divider',
                backgroundColor: 'action.hover',
              }}
            >
              {hovered ? (
                <>
                  <Typography variant="caption" sx={{ fontWeight: 600, display: 'block' }}>
                    {hovered.label}
                    {hovered.kind === 'number' && hovered.min !== undefined && (
                      <Typography component="span" variant="caption" color="text.secondary">
                        {' '}
                        — {hovered.min} to {hovered.max ?? '∞'}
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {hovered.help}
                  </Typography>
                </>
              ) : (
                <Typography variant="caption" color="text.secondary">
                  Point at an option to read what it does.
                </Typography>
              )}
            </Box>
          </Popover>
        </>
      )}
    </Box>
  );
}

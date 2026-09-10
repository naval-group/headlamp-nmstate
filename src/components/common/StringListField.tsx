import { Icon } from '@iconify/react';
import { Autocomplete, Box, Button, IconButton, TextField, Typography } from '@mui/material';
import React from 'react';

interface Props {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  helperText?: string;
  /**
   * Known-good values offered as suggestions.
   *
   * Always free text as well: a policy routinely names an interface it is
   * about to create, which by definition is not yet on any node.
   */
  options?: string[];
  /** Returns why one entry is wrong, or null when it is fine. */
  validate?: (value: string) => string | null;
}

/** An editable list of strings, used for DNS servers, bridge ports and bond members. */
export default function StringListField({
  label,
  values,
  onChange,
  placeholder,
  addLabel,
  helperText,
  options,
  validate,
}: Props) {
  const update = (index: number, value: string) => {
    const next = [...values];
    next[index] = value;
    onChange(next);
  };

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      {values.map((value, index) => {
        // An untouched row is not yet wrong; only complain once something has
        // been typed, so adding a row does not immediately show an error.
        const problem = validate && value.trim() ? validate(value) : null;
        return (
          <Box key={index} sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start', mt: 0.5 }}>
            {options && options.length > 0 ? (
              <Autocomplete
                freeSolo
                fullWidth
                size="small"
                options={options}
                value={value}
                onInputChange={(_, v) => update(index, v)}
                renderInput={params => (
                  <TextField
                    {...params}
                    placeholder={placeholder}
                    error={Boolean(problem)}
                    helperText={problem || undefined}
                  />
                )}
              />
            ) : (
              <TextField
                size="small"
                fullWidth
                value={value}
                placeholder={placeholder}
                error={Boolean(problem)}
                helperText={problem || undefined}
                onChange={e => update(index, e.target.value)}
              />
            )}
            <IconButton
              size="small"
              aria-label={`Remove ${label} entry`}
              onClick={() => onChange(values.filter((_, i) => i !== index))}
              sx={{ mt: 0.25 }}
            >
              <Icon icon="mdi:close" width={18} />
            </IconButton>
          </Box>
        );
      })}
      <Button
        size="small"
        startIcon={<Icon icon="mdi:plus" width={16} />}
        onClick={() => onChange([...values, ''])}
        sx={{ mt: 0.5 }}
      >
        {addLabel ?? `Add ${label.toLowerCase()}`}
      </Button>
      {helperText && (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {helperText}
        </Typography>
      )}
    </Box>
  );
}

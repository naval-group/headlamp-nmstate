import { Box, Typography } from '@mui/material';
import { alpha, useTheme } from '@mui/material/styles';
import React, { useMemo } from 'react';

type Level = 'error' | 'warn' | 'info' | 'plain';

interface LogLine {
  level: Level;
  /** The bracketed prefix nmstate prints, if the line has one. */
  prefix?: string;
  text: string;
}

const LEVEL_PATTERN = /^\[([^\]]*)\]\s*(.*)$/;

/**
 * Splits nmstate's apply output into lines with a severity.
 *
 * The level sits inside the bracket alongside the timestamp and module:
 * `[2026-09-09T21:36:25Z INFO  nmstate::ifaces] Ignoring interface ...`. Lines
 * without a bracket are nmstate's own errors and the wrapper's exit status,
 * which are the ones worth reading.
 */
function parseLines(log: string): LogLine[] {
  return log.split('\n').map(raw => {
    const line = raw.replace(/\s+$/, '');
    const match = LEVEL_PATTERN.exec(line);
    if (match) {
      const prefix = match[1];
      const level: Level = /\bERROR\b/.test(prefix)
        ? 'error'
        : /\bWARN\b/.test(prefix)
        ? 'warn'
        : 'info';
      return { level, prefix, text: match[2] };
    }
    const level: Level = /NmstateError:|\berror\b|failed/i.test(line) ? 'error' : 'plain';
    return { level, text: line };
  });
}

const COLOURS: Record<Level, string> = {
  error: '#f44336',
  warn: '#ff9800',
  info: '#607d8b',
  plain: 'inherit',
};

/**
 * nmstate's apply log, rendered as a log rather than a wall of text.
 *
 * Almost every line is nmstate reporting an interface it decided to leave
 * alone, so the few that matter have to stand out: errors are coloured and
 * given a tinted row, the bracketed timestamp and module are dimmed, and the
 * message itself keeps full contrast.
 */
export default function NmstateLogView({
  log,
  maxHeight = 360,
}: {
  log: string;
  maxHeight?: number | string;
}) {
  const theme = useTheme();
  const lines = useMemo(() => parseLines(log), [log]);

  if (!log.trim()) return null;

  return (
    <Box
      sx={{
        maxHeight,
        overflow: 'auto',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
        backgroundColor: theme.palette.mode === 'dark' ? '#11151a' : '#fafafa',
        fontFamily: 'monospace',
        fontSize: '0.72rem',
        lineHeight: 1.55,
        py: 0.5,
      }}
    >
      {lines.map((line, index) => (
        <Box
          key={index}
          sx={{
            display: 'flex',
            gap: 1,
            px: 1.25,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            ...(line.level === 'error' && {
              backgroundColor: alpha(COLOURS.error, 0.12),
              borderLeft: `3px solid ${COLOURS.error}`,
              pl: 1,
            }),
            ...(line.level === 'warn' && {
              backgroundColor: alpha(COLOURS.warn, 0.1),
              borderLeft: `3px solid ${COLOURS.warn}`,
              pl: 1,
            }),
          }}
        >
          <Typography
            component="span"
            sx={{
              flexShrink: 0,
              width: 34,
              textAlign: 'right',
              color: 'text.disabled',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              userSelect: 'none',
            }}
          >
            {index + 1}
          </Typography>
          <Typography
            component="span"
            sx={{ fontFamily: 'inherit', fontSize: 'inherit', minWidth: 0 }}
          >
            {line.prefix && (
              <Box component="span" sx={{ color: COLOURS[line.level], opacity: 0.75 }}>
                [{line.prefix}]{' '}
              </Box>
            )}
            <Box
              component="span"
              sx={{
                color: line.level === 'info' ? 'text.secondary' : COLOURS[line.level],
                fontWeight: line.level === 'error' ? 600 : 400,
              }}
            >
              {line.text}
            </Box>
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

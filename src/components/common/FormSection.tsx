import { Icon } from '@iconify/react';
import { Accordion, AccordionDetails, AccordionSummary, Grid, Typography } from '@mui/material';

/**
 * Semantic colour palette for form sections.
 *
 * Colours track what the section configures, so the same concern keeps the same
 * colour across every form in the plugin.
 */
export const SECTION_COLORS = {
  policy: '#795548', // Brown  — policy identity and rollout
  selector: '#9c27b0', // Purple — node selection
  interface: '#2196f3', // Blue   — interface definition
  ip: '#4caf50', // Green  — addressing
  routes: '#ff9800', // Orange — routing
  dns: '#00bcd4', // Cyan   — name resolution
  advanced: '#607d8b', // Slate  — rarely-touched knobs
} as const;

export type SectionColor = keyof typeof SECTION_COLORS | string;

interface FormSectionProps {
  icon: string;
  title: string;
  children: React.ReactNode;
  columns?: number;
  spacing?: number;
  noGrid?: boolean;
  /** Semantic color name (e.g. 'metadata', 'compute') or raw hex color */
  color?: SectionColor;
  /** Whether the section starts expanded (default: true) */
  defaultExpanded?: boolean;
}

export default function FormSection({
  icon,
  title,
  children,
  columns,
  spacing = 3,
  noGrid = false,
  color,
  defaultExpanded = true,
}: FormSectionProps) {
  const resolvedColor = color
    ? SECTION_COLORS[color as keyof typeof SECTION_COLORS] || color
    : undefined;

  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      sx={{
        '&:before': { display: 'none' },
        border: '1px solid',
        borderColor: resolvedColor ? `${resolvedColor}33` : 'divider',
        borderRadius: '4px !important',
        ...(resolvedColor && {
          borderLeft: `3px solid ${resolvedColor}`,
          backgroundColor: `${resolvedColor}0D`,
        }),
      }}
    >
      <AccordionSummary
        expandIcon={<Icon icon="mdi:chevron-down" width={24} />}
        sx={{
          minHeight: 56,
          '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1 },
        }}
      >
        <Icon icon={icon} width={24} height={24} color={resolvedColor} />
        <Typography variant="h6">{title}</Typography>
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 1, pb: 2, px: 3 }}>
        {noGrid ? (
          children
        ) : (
          <Grid container spacing={spacing} columns={columns}>
            {children}
          </Grid>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

import { Icon } from '@iconify/react';
import Editor from '@monaco-editor/react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Switch,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import * as yaml from 'js-yaml';
import { useSnackbar } from 'notistack';
import React, { useCallback, useMemo, useState } from 'react';
import { RefreshOutcome } from '../../hooks/useNnsRefresh';
import { interfaceMeta, PROVENANCE, stateColor, typeRank } from '../../nmstate/ifaceMeta';
import { Provenance, Topology, TopologyNode } from '../../nmstate/topology';
import { collapsePodPorts } from './collapse';
import InterfaceDetailsPanel from './InterfaceDetailsPanel';
import InterfaceListView from './InterfaceListView';
import MultiChoiceFilter from './MultiChoiceFilter';
import TopologyCanvas from './TopologyCanvas';

export interface NetworkExplorerProps {
  topology: Topology;
  nodeName: string;
  /** Re-reads the stored snapshot from the API. */
  onReload: () => Promise<RefreshOutcome>;
  /** Asks the handler to look at the node again, then re-reads. */
  onForceRefresh: () => Promise<RefreshOutcome>;
  refreshing: boolean;
  /** Rendered next to the refresh control so a no-op refresh is visible. */
  snapshotAge: React.ReactNode;
  /** The node's whole reported state, shown verbatim on the YAML tab. */
  rawState: unknown;
}

const PROVENANCE_ORDER: Provenance[] = ['managed', 'failing', 'observed', 'phantom'];

type ViewMode = 'list' | 'map' | 'yaml';

/** The canvas needs a bounded height; the list and YAML grow with the page. */
const MAP_HEIGHT = '70vh';

/**
 * The node's network, as a map or as a list.
 *
 * Both views answer different questions but take the same filters, so the
 * toolbar sits above the tabs and switching views keeps whatever the user
 * narrowed down to.
 */
export default function NetworkExplorer({
  topology,
  nodeName,
  onReload,
  onForceRefresh,
  refreshing,
  snapshotAge,
  rawState,
}: NetworkExplorerProps) {
  const { enqueueSnackbar } = useSnackbar();
  const theme = useTheme();
  // The list reads more directly than the map, so it is what the page opens on.
  const [view, setView] = useState<ViewMode>('list');
  const [showMiniMap, setShowMiniMap] = useState(false);
  const [search, setSearch] = useState('');
  // null means every choice is enabled; see MultiChoiceFilter.
  const [typeFilter, setTypeFilter] = useState<Set<string> | null>(null);
  const [stateFilter, setStateFilter] = useState<Set<string> | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [provenanceFilter, setProvenanceFilter] = useState<Provenance[]>([]);
  const [showPhantom, setShowPhantom] = useState(true);
  const [selected, setSelected] = useState<TopologyNode | null>(null);
  const [fitToken, setFitToken] = useState(0);
  const [expandedPorts, setExpandedPorts] = useState<Set<string>>(new Set());

  /** Types and states actually present, with how many carry each. */
  const present = useMemo(() => {
    const types = new Map<string, number>();
    const states = new Map<string, number>();
    for (const node of topology.nodes) {
      types.set(node.type, (types.get(node.type) ?? 0) + 1);
      states.set(node.state, (states.get(node.state) ?? 0) + 1);
    }
    return {
      types: [...types.entries()].sort((a, b) => typeRank(a[0]) - typeRank(b[0])),
      states: [...states.entries()].sort((a, b) => a[0].localeCompare(b[0])),
    };
  }, [topology]);

  const counts = useMemo(() => {
    const byProvenance: Record<Provenance, number> = {
      managed: 0,
      failing: 0,
      observed: 0,
      phantom: 0,
    };
    topology.nodes.forEach(n => byProvenance[n.provenance]++);
    return byProvenance;
  }, [topology]);

  const matches = useCallback(
    (n: TopologyNode) => {
      const q = search.trim().toLowerCase();
      if (q && !n.name.toLowerCase().includes(q) && !n.type.toLowerCase().includes(q)) {
        return false;
      }
      if (typeFilter !== null && !typeFilter.has(n.type)) return false;
      if (stateFilter !== null && !stateFilter.has(n.state)) return false;
      if (provenanceFilter.length && !provenanceFilter.includes(n.provenance)) return false;
      return true;
    },
    [search, typeFilter, stateFilter, provenanceFilter]
  );

  /** Controllers whose pod ports the map would fold if left alone. */
  const foldable = useMemo(() => {
    const visible = new Set(topology.nodes.map(n => n.id));
    return [...collapsePodPorts(topology, visible, new Set()).folded.keys()];
  }, [topology]);

  const allExpanded = foldable.length > 0 && foldable.every(c => expandedPorts.has(c));

  const toggleProvenance = (p: Provenance) =>
    setProvenanceFilter(current =>
      current.includes(p) ? current.filter(x => x !== p) : [...current, p]
    );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      <Paper
        variant="outlined"
        sx={{ p: 1, mb: 1, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}
      >
        <TextField
          size="small"
          placeholder="Filter interfaces…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ minWidth: 190 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Icon icon="mdi:magnify" width={18} />
              </InputAdornment>
            ),
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch('')} aria-label="Clear filter">
                  <Icon icon="mdi:close" width={16} />
                </IconButton>
              </InputAdornment>
            ) : null,
          }}
        />

        <MultiChoiceFilter
          label="types"
          minWidth={165}
          selected={typeFilter}
          onChange={setTypeFilter}
          choices={present.types.map(([type, count]) => ({
            value: type,
            label: interfaceMeta(type).label,
            count,
            adornment: (
              <Icon icon={interfaceMeta(type).icon} width={16} color={interfaceMeta(type).color} />
            ),
          }))}
        />

        <MultiChoiceFilter
          label="states"
          minWidth={150}
          selected={stateFilter}
          onChange={setStateFilter}
          choices={present.states.map(([state, count]) => ({
            value: state,
            label: state,
            count,
            adornment: (
              <Box
                component="span"
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: stateColor(state),
                  display: 'inline-block',
                }}
              />
            ),
          }))}
        />

        {topology.phantomCount > 0 && (
          <Tooltip title={PROVENANCE.phantom.description}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={showPhantom}
                  onChange={e => setShowPhantom(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2">
                  {topology.phantomCount} filtered port
                  {topology.phantomCount > 1 ? 's' : ''}
                </Typography>
              }
            />
          </Tooltip>
        )}

        <Box sx={{ flex: 1 }} />

        {snapshotAge}
        {/*
          The stored timestamp is when the state last *changed*: the handler
          re-reads a node on request but deliberately does not rewrite the
          object when nothing differs, so without this a refresh that found no
          change looked like a refresh that did nothing.
        */}
        {checkedAt && (
          <Tooltip title={`Last checked at ${checkedAt.toLocaleTimeString()}`}>
            <Chip
              size="small"
              icon={<Icon icon="mdi:check-circle-outline" width={13} />}
              label="checked"
              sx={{ height: 22, borderLeft: '3px solid #4caf50', borderRadius: 0.5 }}
            />
          </Tooltip>
        )}
        <Tooltip title="Ask the nmstate handler to read this node again, then reload">
          <span>
            <Button
              size="small"
              variant="outlined"
              disabled={refreshing}
              startIcon={
                refreshing ? <CircularProgress size={14} /> : <Icon icon="mdi:refresh" width={16} />
              }
              onClick={() => {
                onForceRefresh().then(outcome => {
                  if (outcome.status === 'ok') {
                    setCheckedAt(new Date());
                    enqueueSnackbar(
                      outcome.changed
                        ? 'Node network state refreshed'
                        : 'The handler re-read this node and found nothing changed, so it left the stored state alone',
                      { variant: outcome.changed ? 'success' : 'info' }
                    );
                  } else if (outcome.status === 'forbidden') {
                    enqueueSnackbar(
                      'Forcing a refresh needs permission to label NodeNetworkStates, which this account does not have.',
                      { variant: 'warning' }
                    );
                  } else {
                    enqueueSnackbar(`Could not refresh: ${outcome.message}`, { variant: 'error' });
                  }
                });
              }}
            >
              Refresh
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Re-read the stored snapshot without asking the handler">
          <IconButton
            size="small"
            disabled={refreshing}
            onClick={() => {
              onReload().then(outcome => {
                if (outcome.status === 'error') {
                  enqueueSnackbar(`Could not re-read: ${outcome.message}`, { variant: 'error' });
                }
              });
            }}
            aria-label="Re-read stored snapshot"
          >
            <Icon icon="mdi:reload" width={20} />
          </IconButton>
        </Tooltip>
        {view === 'map' && foldable.length > 0 && (
          <Tooltip
            title={
              allExpanded
                ? 'Fold each bridge’s pod ports back into a single node'
                : 'Show every pod port individually'
            }
          >
            <IconButton
              size="small"
              onClick={() => setExpandedPorts(allExpanded ? new Set() : new Set(foldable))}
              aria-label={allExpanded ? 'Collapse pod ports' : 'Expand pod ports'}
            >
              <Icon
                icon={allExpanded ? 'mdi:arrow-collapse-vertical' : 'mdi:arrow-expand-vertical'}
                width={20}
              />
            </IconButton>
          </Tooltip>
        )}
        {view === 'map' && (
          <Tooltip title={showMiniMap ? 'Hide the overview' : 'Show the overview'}>
            <IconButton
              size="small"
              onClick={() => setShowMiniMap(v => !v)}
              aria-label="Toggle overview"
              color={showMiniMap ? 'primary' : 'default'}
            >
              <Icon icon="mdi:map-outline" width={20} />
            </IconButton>
          </Tooltip>
        )}
        {view === 'map' && (
          <Tooltip title="Fit to view">
            <IconButton
              size="small"
              onClick={() => setFitToken(t => t + 1)}
              aria-label="Fit to view"
            >
              <Icon icon="mdi:fit-to-screen-outline" width={20} />
            </IconButton>
          </Tooltip>
        )}
      </Paper>

      <Tabs
        value={view}
        onChange={(_, v) => setView(v)}
        sx={{ minHeight: 36, mb: 1, '& .MuiTab-root': { minHeight: 36, py: 0 } }}
      >
        <Tab
          value="list"
          label="List"
          icon={<Icon icon="mdi:format-list-bulleted" width={16} />}
          iconPosition="start"
        />
        <Tab
          value="map"
          label="Map"
          icon={<Icon icon="mdi:graph-outline" width={16} />}
          iconPosition="start"
        />
        <Tab
          value="yaml"
          label="YAML"
          icon={<Icon icon="mdi:code-braces" width={16} />}
          iconPosition="start"
        />
      </Tabs>

      {view === 'map' ? (
        <Box sx={{ display: 'flex', gap: 1, height: MAP_HEIGHT, minHeight: 0 }}>
          <TopologyCanvas
            topology={topology}
            matches={matches}
            showPhantom={showPhantom}
            onSelect={setSelected}
            fitToken={fitToken}
            showMiniMap={showMiniMap}
            expanded={expandedPorts}
            onToggleExpanded={controller =>
              setExpandedPorts(current => {
                const next = new Set(current);
                if (next.has(controller)) next.delete(controller);
                else next.add(controller);
                return next;
              })
            }
          />
          {selected && <InterfaceDetailsPanel node={selected} onClose={() => setSelected(null)} />}
        </Box>
      ) : view === 'list' ? (
        <InterfaceListView topology={topology} matches={matches} showPhantom={showPhantom} />
      ) : (
        /* Monaco rather than a <pre>: it brings YAML highlighting, folding and
           its own find widget, so a large node state is searchable instead of
           being a wall of text. */
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
          }}
        >
          <Editor
            height="70vh"
            language="yaml"
            theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
            value={yaml.dump(rawState, { lineWidth: -1, noRefs: true })}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 12,
              wordWrap: 'on',
              folding: true,
              renderLineHighlight: 'none',
            }}
          />
        </Box>
      )}

      {/* Legend, doubling as a provenance filter. */}
      <Paper
        variant="outlined"
        sx={{ mt: 1, px: 1.5, py: 0.75, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}
      >
        <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
          {nodeName} — {topology.nodes.length} interfaces
        </Typography>
        {PROVENANCE_ORDER.filter(p => counts[p] > 0).map(p => {
          const active = provenanceFilter.includes(p);
          return (
            <Tooltip key={p} title={`${PROVENANCE[p].description} — click to filter`}>
              <Chip
                size="small"
                clickable
                onClick={() => toggleProvenance(p)}
                icon={<Icon icon={PROVENANCE[p].icon} width={14} />}
                label={`${PROVENANCE[p].label} · ${counts[p]}`}
                variant={active ? 'filled' : 'outlined'}
                sx={{
                  height: 22,
                  borderLeft: `3px solid ${PROVENANCE[p].color}`,
                  borderRadius: 0.5,
                  ...(active && { backgroundColor: `${PROVENANCE[p].color}33` }),
                }}
              />
            </Tooltip>
          );
        })}
        {provenanceFilter.length > 0 && (
          <Button size="small" onClick={() => setProvenanceFilter([])}>
            Clear
          </Button>
        )}
      </Paper>
    </Box>
  );
}

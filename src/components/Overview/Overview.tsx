import { Icon } from '@iconify/react';
import { K8s } from '@kinvolk/headlamp-plugin/lib';
import {
  Link,
  Loader,
  SectionBox,
  SimpleTable,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Box, Chip, Paper, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useMemo } from 'react';
import { interfaceMeta, typeRank } from '../../nmstate/ifaceMeta';
import {
  NodeNetworkConfigurationEnactment,
  NodeNetworkConfigurationPolicy,
  NodeNetworkState,
} from '../../nmstate/resources';
import { HEALTH_COLOR, podHealth } from '../Health/podHealth';
import SnapshotAge from '../NodeNetworkStates/SnapshotAge';
import { policyStatusColor } from '../Policies/status';

type NNS = InstanceType<typeof NodeNetworkState>;
type NNCE = InstanceType<typeof NodeNetworkConfigurationEnactment>;

const HANDLER_SELECTOR = 'name=nmstate-handler';

/** One headline number, with the detail that qualifies it underneath. */
function Tile({
  icon,
  label,
  value,
  detail,
  color,
  to,
}: {
  icon: string;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  color: string;
  to?: { routeName: string };
}) {
  const body = (
    <Paper
      variant="outlined"
      sx={{
        p: 1.5,
        minWidth: 190,
        flex: '1 1 190px',
        borderLeft: `4px solid ${color}`,
        backgroundColor: alpha(color, 0.05),
        height: '100%',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
        <Icon icon={icon} width={16} color={color} />
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Box>
      <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.1 }}>
        {value}
      </Typography>
      {detail && (
        <Typography variant="caption" color="text.secondary">
          {detail}
        </Typography>
      )}
    </Paper>
  );
  return to ? (
    <Link
      routeName={to.routeName}
      params={{}}
      style={{ flex: '1 1 190px', textDecoration: 'none' }}
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export default function Overview() {
  const [states] = NodeNetworkState.useList();
  const [policies] = NodeNetworkConfigurationPolicy.useList();
  const [enactments] = NodeNetworkConfigurationEnactment.useList();
  const [handlerPods] = K8s.ResourceClasses.Pod.useList({ labelSelector: HANDLER_SELECTOR });
  const [nodes] = K8s.ResourceClasses.Node.useList();

  const policyStats = useMemo(() => {
    const list = policies ?? [];
    const by = (status: string) => list.filter(p => p.getStatus() === status).length;
    return {
      total: list.length,
      available: by('Available'),
      degraded: by('Degraded'),
      ignored: by('Ignored'),
    };
  }, [policies]);

  const enactmentStats = useMemo(() => {
    const list = enactments ?? [];
    return {
      total: list.length,
      failing: list.filter(e => e.getFailureMessage()).length,
      available: list.filter(e => e.getStatus() === 'Available').length,
    };
  }, [enactments]);

  const handlerStats = useMemo(() => {
    const pods = handlerPods ?? [];
    const ready = pods.filter(p => podHealth(p).level === 'healthy').length;
    // The handler is a DaemonSet, so one pod per schedulable node is expected.
    return { ready, total: pods.length, expected: (nodes ?? []).length };
  }, [handlerPods, nodes]);

  const enactmentsByNode = useMemo(() => {
    const map = new Map<string, NNCE[]>();
    for (const e of enactments ?? []) {
      if (!map.has(e.nodeName)) map.set(e.nodeName, []);
      map.get(e.nodeName)?.push(e);
    }
    return map;
  }, [enactments]);

  if (!states) return <Loader title="Loading nmstate overview" />;

  const handlerColor =
    handlerStats.expected > 0 && handlerStats.ready < handlerStats.expected
      ? HEALTH_COLOR.degraded
      : HEALTH_COLOR.healthy;

  return (
    <>
      <SectionBox title="NMState Overview">
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
          <Tile
            icon="mdi:server-network"
            label="Nodes reporting state"
            value={states.length}
            detail={handlerStats.expected ? `of ${handlerStats.expected} cluster nodes` : undefined}
            color="#2196f3"
          />
          <Tile
            icon="mdi:heart-pulse"
            label="Handler pods ready"
            value={`${handlerStats.ready}/${handlerStats.total || handlerStats.expected}`}
            detail={
              handlerStats.expected && handlerStats.total < handlerStats.expected
                ? `${handlerStats.expected - handlerStats.total} node(s) without a handler`
                : 'one per node'
            }
            color={handlerColor}
          />
          <Tile
            icon="mdi:file-document-outline"
            label="Policies"
            value={policyStats.total}
            detail={
              <>
                {policyStats.available} available
                {policyStats.degraded > 0 ? `, ${policyStats.degraded} degraded` : ''}
                {policyStats.ignored > 0 ? `, ${policyStats.ignored} matching no node` : ''}
              </>
            }
            color={policyStats.degraded > 0 ? HEALTH_COLOR.failed : '#4caf50'}
          />
          <Tile
            icon="mdi:checkbox-marked-circle-outline"
            label="Enactments"
            value={`${enactmentStats.available}/${enactmentStats.total}`}
            detail={
              enactmentStats.failing > 0
                ? `${enactmentStats.failing} failing`
                : 'all applied successfully'
            }
            color={enactmentStats.failing > 0 ? HEALTH_COLOR.failed : '#4caf50'}
          />
        </Box>
      </SectionBox>

      <SectionBox title="Nodes">
        <SimpleTable
          columns={[
            {
              label: 'Node',
              getter: (nns: NNS) => (
                <Link routeName="nns" params={{ name: nns.getName() }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Icon icon="mdi:server-network" width={16} />
                    {nns.getName()}
                  </Box>
                </Link>
              ),
            },
            {
              label: 'Interfaces',
              getter: (nns: NNS) => {
                const counts = new Map<string, number>();
                nns.interfaces.forEach(i => {
                  const t = i.type ?? 'unknown';
                  counts.set(t, (counts.get(t) ?? 0) + 1);
                });
                return (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {[...counts.entries()]
                      .sort((a, b) => typeRank(a[0]) - typeRank(b[0]))
                      .map(([type, n]) => (
                        <Tooltip key={type} title={`${n} × ${interfaceMeta(type).label}`}>
                          <Chip
                            size="small"
                            icon={<Icon icon={interfaceMeta(type).icon} width={13} />}
                            label={n}
                            sx={{
                              height: 20,
                              borderLeft: `3px solid ${interfaceMeta(type).color}`,
                              borderRadius: 0.5,
                            }}
                          />
                        </Tooltip>
                      ))}
                  </Box>
                );
              },
            },
            {
              label: 'Addresses',
              getter: (nns: NNS) => (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {nns.interfaces
                    .filter(i => i.type !== 'loopback')
                    .flatMap(i =>
                      (i.ipv4?.enabled ? i.ipv4.address ?? [] : []).map(
                        a => `${a.ip}/${a['prefix-length']}`
                      )
                    )
                    .join(', ') || '—'}
                </Typography>
              ),
            },
            {
              label: 'Policies applied',
              getter: (nns: NNS) => {
                const mine = enactmentsByNode.get(nns.getName()) ?? [];
                if (mine.length === 0) {
                  return (
                    <Typography variant="body2" color="text.secondary">
                      none
                    </Typography>
                  );
                }
                return (
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {mine.map(e => (
                      <Link key={e.getName()} routeName="nncp" params={{ name: e.policyName }}>
                        <Chip
                          size="small"
                          label={e.policyName}
                          sx={{
                            height: 20,
                            borderLeft: `3px solid ${policyStatusColor(e.getStatus())}`,
                            borderRadius: 0.5,
                          }}
                        />
                      </Link>
                    ))}
                  </Box>
                );
              },
            },
            {
              label: 'State last changed',
              getter: (nns: NNS) => <SnapshotAge nns={nns} />,
            },
          ]}
          data={states}
        />
      </SectionBox>
    </>
  );
}

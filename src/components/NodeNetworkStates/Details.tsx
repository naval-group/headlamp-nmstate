import { Icon } from '@iconify/react';
import {
  Link,
  Loader,
  NameValueTable,
  SectionBox,
  SectionHeader,
  SimpleTable,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import { Alert, Box, Chip, Typography } from '@mui/material';
import React, { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useNnsRefresh } from '../../hooks/useNnsRefresh';
import { useProvenance } from '../../hooks/useProvenance';
import { NodeNetworkConfigurationEnactment, NodeNetworkState } from '../../nmstate/resources';
import { buildTopology } from '../../nmstate/topology';
import CoverageNote from './CoverageNote';
import NetworkExplorer from './NetworkExplorer';
import SnapshotAge from './SnapshotAge';

export default function NodeNetworkStateDetails() {
  const { name } = useParams<{ name: string }>();
  const { snapshot, refetch, forceRefresh, busy } = useNnsRefresh(name);
  const [watched, error] = NodeNetworkState.useGet(name);
  // A manual re-read wins over the watched copy until the watch catches up.
  const nns = snapshot ?? watched;
  const [enactments] = NodeNetworkConfigurationEnactment.useList();

  const provenanceOf = useProvenance(enactments, name);

  const topology = useMemo(
    () => (nns ? buildTopology(nns.interfaces, provenanceOf) : null),
    [nns, provenanceOf]
  );

  if (error) {
    return (
      <SectionBox title="Node Network State" backLink>
        <Alert severity="error" variant="filled">
          {String(error)}
        </Alert>
      </SectionBox>
    );
  }

  if (!nns || !topology) return <Loader title="Loading node network state" />;

  const routes = nns.routes;

  return (
    <>
      <SectionBox title={`Node Network State: ${name}`} backLink>
        <NameValueTable
          rows={[
            {
              name: 'Node',
              value: (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Icon icon="mdi:server-network" width={18} />
                  {name}
                </Box>
              ),
            },
            { name: 'State last changed', value: <SnapshotAge nns={nns} /> },
            { name: 'nmstate', value: nns.nmstateVersion || '—' },
            { name: 'NetworkManager', value: nns.networkManagerVersion || '—' },
            {
              name: 'DNS servers',
              value: nns.dnsServers.length ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {nns.dnsServers.map(s => (
                    <Chip key={s} size="small" label={s} sx={{ height: 20 }} />
                  ))}
                </Box>
              ) : (
                '—'
              ),
            },
            {
              name: 'DNS search',
              value: nns.dnsSearch.length ? nns.dnsSearch.join(', ') : '—',
            },
          ]}
        />
      </SectionBox>

      <SectionBox
        title={
          <SectionHeader
            title="Network Topology"
            titleSideActions={[
              <Typography key="hint" variant="caption" color="text.secondary">
                Click an interface for details · drag to rearrange · ⌘/Ctrl + scroll to zoom
              </Typography>,
            ]}
          />
        }
      >
        <NetworkExplorer
          topology={topology}
          nodeName={name}
          onReload={refetch}
          onForceRefresh={forceRefresh}
          refreshing={busy}
          snapshotAge={<SnapshotAge nns={nns} />}
          rawState={nns.currentState}
        />
      </SectionBox>

      <SectionBox title="Coverage">
        <CoverageNote
          filteredPorts={topology.phantomCount}
          reportedInterfaces={nns.interfaces.length}
        />
      </SectionBox>

      <SectionBox title="Routes">
        {routes.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No routes reported.
          </Typography>
        ) : (
          <SimpleTable
            columns={[
              { label: 'Destination', getter: r => <code>{r.destination}</code> },
              { label: 'Next hop', getter: r => <code>{r['next-hop-address'] || '—'}</code> },
              {
                label: 'Interface',
                getter: r => r['next-hop-interface'] || '—',
              },
              { label: 'Metric', getter: r => r.metric ?? '—' },
              { label: 'Table', getter: r => r['table-id'] ?? '—' },
            ]}
            data={routes}
          />
        )}
      </SectionBox>

      <SectionBox title="Enactments on this node">
        <EnactmentsForNode nodeName={name} />
      </SectionBox>
    </>
  );
}

/** The per-node apply results, so a failure is one click from the topology. */
function EnactmentsForNode({ nodeName }: { nodeName: string }) {
  const [enactments] = NodeNetworkConfigurationEnactment.useList();
  const mine = (enactments ?? []).filter(e => e.nodeName === nodeName);

  if (!enactments) return <Loader title="Loading enactments" />;
  if (mine.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        No policy has been enacted on this node.
      </Typography>
    );
  }

  return (
    <SimpleTable
      columns={[
        {
          label: 'Policy',
          getter: (e: NodeNetworkConfigurationEnactment) => (
            <Link routeName="nncp" params={{ name: e.policyName }}>
              {e.policyName}
            </Link>
          ),
        },
        {
          label: 'Status',
          getter: (e: NodeNetworkConfigurationEnactment) => e.getStatus(),
        },
        {
          label: 'Reason',
          getter: (e: NodeNetworkConfigurationEnactment) => e.getReason(),
        },
        {
          label: 'Interfaces',
          getter: (e: NodeNetworkConfigurationEnactment) =>
            e.getManagedInterfaceNames().join(', ') || '—',
        },
        {
          label: '',
          getter: (e: NodeNetworkConfigurationEnactment) => (
            <Link routeName="nnce" params={{ name: e.metadata.name }}>
              Details
            </Link>
          ),
        },
      ]}
      data={mine}
    />
  );
}

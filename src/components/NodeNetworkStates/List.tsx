import { Icon } from '@iconify/react';
import {
  DateLabel,
  Link,
  SectionBox,
  SectionFilterHeader,
  Table,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import {
  Box,
  Chip,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
import React from 'react';
import { useHistory } from 'react-router-dom';
import { interfaceMeta, typeRank } from '../../nmstate/ifaceMeta';
import { NodeNetworkState } from '../../nmstate/resources';
import SnapshotAge from './SnapshotAge';

type NNS = InstanceType<typeof NodeNetworkState>;

/**
 * Ports a bridge names but that are absent from the reported interfaces.
 *
 * The node detail counts these alongside the reported interfaces, so the list
 * has to as well — otherwise the same node shows two different totals
 * depending on which page you are on.
 */
function filteredPortCount(nns: NNS): number {
  const reported = new Set(nns.interfaces.map(i => i.name));
  return nns.interfaces
    .flatMap(i => i.bridge?.port ?? [])
    .filter(p => p?.name && !reported.has(p.name)).length;
}

function ipv4Addresses(nns: NNS): string[] {
  return nns.interfaces
    .filter(i => i.type !== 'loopback')
    .flatMap(i =>
      (i.ipv4?.enabled ? i.ipv4.address ?? [] : []).map(a => `${a.ip}/${a['prefix-length']}`)
    );
}

export default function NodeNetworkStateList() {
  const [items, error] = NodeNetworkState.useList();
  const history = useHistory();

  return (
    <SectionBox
      title={<SectionFilterHeader title="Node Network States" noNamespaceFilter />}
      backLink
    >
      <Table
        data={items ?? []}
        errorMessage={error ? String(error) : undefined}
        enableRowActions
        /*
          No delete and no selection here. A NodeNetworkState is owned by its
          Node and rewritten by the handler, so removing one deletes a report,
          not a configuration, and the handler puts it straight back.
        */
        renderRowActionMenuItems={({
          row,
          closeMenu,
        }: {
          row: { original: NNS };
          closeMenu: () => void;
        }) => [
          <MenuItem
            key="open"
            onClick={() => {
              closeMenu();
              history.push(`/nmstate/states/${encodeURIComponent(row.original.getName())}`);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:graph-outline" width={20} />
            </ListItemIcon>
            <ListItemText>View topology</ListItemText>
          </MenuItem>,
        ]}
        columns={[
          {
            id: 'node',
            header: 'Node',
            accessorFn: (nns: NNS) => nns.getName(),
            Cell: ({ row }: { row: { original: NNS } }) => (
              <Link routeName="nns" params={{ name: row.original.getName() }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Icon icon="mdi:server-network" width={18} />
                  {row.original.getName()}
                </Box>
              </Link>
            ),
          },
          {
            id: 'interfaces',
            header: 'Interfaces',
            accessorFn: (nns: NNS) => nns.interfaces.length + filteredPortCount(nns),
            Cell: ({ row }: { row: { original: NNS } }) => {
              const nns = row.original;
              const counts = new Map<string, number>();
              nns.interfaces.forEach(i => {
                const t = i.type ?? 'unknown';
                counts.set(t, (counts.get(t) ?? 0) + 1);
              });
              const filtered = filteredPortCount(nns);
              const total = nns.interfaces.length + filtered;
              return (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, mr: 0.5 }}>
                    {total}
                  </Typography>
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
                  {filtered > 0 && (
                    <Tooltip
                      title={`${filtered} bridge port(s) filtered out of the reported state`}
                    >
                      <Chip
                        size="small"
                        icon={<Icon icon="mdi:ghost-outline" width={13} />}
                        label={filtered}
                        sx={{ height: 20, borderLeft: '3px solid #616161', borderRadius: 0.5 }}
                      />
                    </Tooltip>
                  )}
                </Box>
              );
            },
          },
          {
            id: 'addresses',
            header: 'Addresses',
            accessorFn: (nns: NNS) => ipv4Addresses(nns).join(' '),
            Cell: ({ row }: { row: { original: NNS } }) => {
              const addrs = ipv4Addresses(row.original);
              return (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {addrs.slice(0, 2).join(', ') || '—'}
                  {addrs.length > 2 ? ` +${addrs.length - 2}` : ''}
                </Typography>
              );
            },
          },
          {
            id: 'dns',
            header: 'DNS',
            accessorFn: (nns: NNS) => nns.dnsServers.join(' '),
            Cell: ({ row }: { row: { original: NNS } }) => (
              <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                {row.original.dnsServers.join(', ') || '—'}
              </Typography>
            ),
          },
          {
            id: 'snapshot',
            header: 'Snapshot',
            accessorFn: (nns: NNS) => nns.getSnapshotAgeSeconds() ?? Number.MAX_SAFE_INTEGER,
            Cell: ({ row }: { row: { original: NNS } }) => <SnapshotAge nns={row.original} />,
          },
          {
            id: 'age',
            header: 'Age',
            accessorFn: (nns: NNS) => nns.metadata.creationTimestamp,
            Cell: ({ row }: { row: { original: NNS } }) => (
              <DateLabel date={row.original.metadata.creationTimestamp} />
            ),
          },
        ]}
      />
    </SectionBox>
  );
}

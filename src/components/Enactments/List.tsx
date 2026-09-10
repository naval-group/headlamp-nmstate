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
import { NodeNetworkConfigurationEnactment } from '../../nmstate/resources';
import { policyStatusColor } from '../Policies/status';

type NNCE = InstanceType<typeof NodeNetworkConfigurationEnactment>;

export default function EnactmentList() {
  const [items, error] = NodeNetworkConfigurationEnactment.useList();
  const history = useHistory();

  return (
    <SectionBox
      title={
        <SectionFilterHeader title="Node Network Configuration Enactments" noNamespaceFilter />
      }
      backLink
    >
      <Table
        data={items ?? []}
        errorMessage={error ? String(error) : undefined}
        enableRowActions
        /*
          No delete here either. An enactment is the handler's record of what it
          did on a node, owned by that Node and recreated on the next apply;
          deleting one loses the report and changes nothing on the cluster.
        */
        renderRowActionMenuItems={({
          row,
          closeMenu,
        }: {
          row: { original: NNCE };
          closeMenu: () => void;
        }) => [
          <MenuItem
            key="open"
            onClick={() => {
              closeMenu();
              history.push(`/nmstate/enactments/${encodeURIComponent(row.original.getName())}`);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:text-box-outline" width={20} />
            </ListItemIcon>
            <ListItemText>View details</ListItemText>
          </MenuItem>,
          <MenuItem
            key="policy"
            onClick={() => {
              closeMenu();
              history.push(`/nmstate/policies/${encodeURIComponent(row.original.policyName)}`);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:file-document-outline" width={20} />
            </ListItemIcon>
            <ListItemText>View policy</ListItemText>
          </MenuItem>,
          <MenuItem
            key="node"
            onClick={() => {
              closeMenu();
              history.push(`/nmstate/states/${encodeURIComponent(row.original.nodeName)}`);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:server-network" width={20} />
            </ListItemIcon>
            <ListItemText>View node topology</ListItemText>
          </MenuItem>,
        ]}
        columns={[
          {
            id: 'name',
            header: 'Enactment',
            accessorFn: (e: NNCE) => e.getName(),
            Cell: ({ row }: { row: { original: NNCE } }) => (
              <Link routeName="nnce" params={{ name: row.original.getName() }}>
                {row.original.getName()}
              </Link>
            ),
          },
          {
            id: 'node',
            header: 'Node',
            accessorFn: (e: NNCE) => e.nodeName,
            Cell: ({ row }: { row: { original: NNCE } }) => (
              <Link routeName="nns" params={{ name: row.original.nodeName }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Icon icon="mdi:server-network" width={18} />
                  {row.original.nodeName}
                </Box>
              </Link>
            ),
          },
          {
            id: 'policy',
            header: 'Policy',
            accessorFn: (e: NNCE) => e.policyName,
            Cell: ({ row }: { row: { original: NNCE } }) => (
              <Link routeName="nncp" params={{ name: row.original.policyName }}>
                {row.original.policyName}
              </Link>
            ),
          },
          {
            id: 'status',
            header: 'Status',
            accessorFn: (e: NNCE) => e.getStatus(),
            Cell: ({ row }: { row: { original: NNCE } }) => {
              const status = row.original.getStatus();
              const failure = row.original.getFailureMessage();
              return (
                <Tooltip title={failure || row.original.getReason()}>
                  <Chip
                    size="small"
                    icon={failure ? <Icon icon="mdi:alert-circle-outline" width={13} /> : undefined}
                    label={status}
                    sx={{
                      height: 22,
                      borderLeft: `3px solid ${policyStatusColor(status)}`,
                      borderRadius: 0.5,
                    }}
                  />
                </Tooltip>
              );
            },
          },
          {
            id: 'reason',
            header: 'Reason',
            accessorFn: (e: NNCE) => e.getReason(),
          },
          {
            id: 'interfaces',
            header: 'Interfaces',
            accessorFn: (e: NNCE) => e.getManagedInterfaceNames().join(' '),
            Cell: ({ row }: { row: { original: NNCE } }) => (
              <Typography variant="body2">
                {row.original.getManagedInterfaceNames().join(', ') || '—'}
              </Typography>
            ),
          },
          {
            id: 'generation',
            header: 'Policy gen.',
            accessorFn: (e: NNCE) => e.policyGeneration ?? -1,
          },
          {
            id: 'age',
            header: 'Age',
            accessorFn: (e: NNCE) => e.metadata.creationTimestamp,
            Cell: ({ row }: { row: { original: NNCE } }) => (
              <DateLabel date={row.original.metadata.creationTimestamp} />
            ),
          },
        ]}
      />
    </SectionBox>
  );
}

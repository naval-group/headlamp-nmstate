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
  Button,
  Chip,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Tooltip,
  Typography,
} from '@mui/material';
// Type-only: material-react-table is Headlamp's table implementation and is
// not an export a plugin may import at runtime.
import type { MRT_TableInstance } from 'material-react-table';
import React, { useState } from 'react';
import { interfaceMeta } from '../../nmstate/ifaceMeta';
import { NodeNetworkConfigurationPolicy } from '../../nmstate/resources';
import CreateResourceDialog from '../common/CreateResourceDialog';
import DeletePolicyDialog from './DeletePolicyDialog';
import { duplicateOf } from './duplicate';
import NNCPForm, { sanitizeNNCP, validateNNCP } from './NNCPForm';
import { policyStatusColor } from './status';

type NNCP = InstanceType<typeof NodeNetworkConfigurationPolicy>;

export const INITIAL_NNCP = {
  apiVersion: 'nmstate.io/v1',
  kind: 'NodeNetworkConfigurationPolicy',
  metadata: { name: '' },
  spec: {
    nodeSelector: { 'kubernetes.io/hostname': '' },
    desiredState: {
      interfaces: [
        {
          // Left blank on purpose: the field shows br01 as a placeholder, so a
          // suggestion does not become a value nobody meant to keep.
          name: '',
          type: 'linux-bridge',
          state: 'up',
          ipv4: { enabled: false },
          ipv6: { enabled: false },
          bridge: { options: { stp: { enabled: false } }, port: [] },
        },
      ],
    },
  },
};

export default function PolicyList() {
  const [items, error] = NodeNetworkConfigurationPolicy.useList();
  const [createOpen, setCreateOpen] = useState(false);
  const [initialTab, setInitialTab] = useState(0);
  const [editItem, setEditItem] = useState<NNCP | null>(null);
  const [editTab, setEditTab] = useState(0);
  const [duplicateItem, setDuplicateItem] = useState<NNCP | null>(null);
  const [deleteItems, setDeleteItems] = useState<NNCP[]>([]);

  return (
    <SectionBox
      title={
        <SectionFilterHeader
          title="Node Network Configuration Policies"
          noNamespaceFilter
          actions={[
            <Button
              key="create"
              variant="contained"
              startIcon={<Icon icon="mdi:plus" width={18} />}
              onClick={() => {
                setInitialTab(0);
                setCreateOpen(true);
              }}
            >
              Create Policy
            </Button>,
          ]}
        />
      }
      backLink
    >
      <Table
        data={items ?? []}
        errorMessage={error ? String(error) : undefined}
        enableRowActions
        enableRowSelection
        getRowId={(policy: NNCP) => policy.metadata?.uid ?? policy.getName()}
        renderRowSelectionToolbar={({ table }: { table: MRT_TableInstance<NNCP> }) => (
          <Tooltip title="Delete selected policies">
            <IconButton
              onClick={() => setDeleteItems(table.getSelectedRowModel().rows.map(r => r.original))}
              aria-label="Delete selected"
            >
              <Icon icon="mdi:delete" width={22} />
            </IconButton>
          </Tooltip>
        )}
        renderRowActionMenuItems={({
          row,
          closeMenu,
        }: {
          row: { original: NNCP };
          closeMenu: () => void;
        }) => [
          <MenuItem
            key="wizard"
            onClick={() => {
              closeMenu();
              setEditTab(0);
              setEditItem(row.original);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:auto-fix" width={20} />
            </ListItemIcon>
            <ListItemText>Edit with Wizard</ListItemText>
          </MenuItem>,
          <MenuItem
            key="yaml"
            onClick={() => {
              closeMenu();
              setEditTab(1);
              setEditItem(row.original);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:code-braces" width={20} />
            </ListItemIcon>
            <ListItemText>Edit YAML</ListItemText>
          </MenuItem>,
          <MenuItem
            key="duplicate"
            onClick={() => {
              closeMenu();
              setDuplicateItem(row.original);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:content-duplicate" width={20} />
            </ListItemIcon>
            <ListItemText>Create one like this</ListItemText>
          </MenuItem>,
          <Divider key="divider" />,
          <MenuItem
            key="delete"
            onClick={() => {
              closeMenu();
              setDeleteItems([row.original]);
            }}
          >
            <ListItemIcon>
              <Icon icon="mdi:delete" width={20} />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>,
        ]}
        columns={[
          {
            id: 'name',
            header: 'Name',
            accessorFn: (p: NNCP) => p.getName(),
            Cell: ({ row }: { row: { original: NNCP } }) => (
              <Link routeName="nncp" params={{ name: row.original.getName() }}>
                {row.original.getName()}
              </Link>
            ),
          },
          {
            id: 'status',
            header: 'Status',
            accessorFn: (p: NNCP) => p.getStatus(),
            Cell: ({ row }: { row: { original: NNCP } }) => {
              const status = row.original.getStatus();
              const color = policyStatusColor(status);
              return (
                <Tooltip title={row.original.getMessage() || row.original.getReason()}>
                  <Chip
                    size="small"
                    label={status}
                    sx={{ height: 22, borderLeft: `3px solid ${color}`, borderRadius: 0.5 }}
                  />
                </Tooltip>
              );
            },
          },
          {
            id: 'reason',
            header: 'Reason',
            accessorFn: (p: NNCP) => p.getReason(),
          },
          {
            id: 'interfaces',
            header: 'Interfaces',
            accessorFn: (p: NNCP) => p.getManagedInterfaceNames().join(' '),
            Cell: ({ row }: { row: { original: NNCP } }) => (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                {(row.original.desiredState.interfaces ?? []).map(i => (
                  <Chip
                    key={i.name}
                    size="small"
                    icon={<Icon icon={interfaceMeta(i.type).icon} width={13} />}
                    label={i.name}
                    sx={{
                      height: 20,
                      borderLeft: `3px solid ${interfaceMeta(i.type).color}`,
                      borderRadius: 0.5,
                    }}
                  />
                ))}
              </Box>
            ),
          },
          {
            id: 'selector',
            header: 'Node selector',
            accessorFn: (p: NNCP) =>
              Object.entries(p.nodeSelector)
                .map(([k, v]) => `${k}=${v}`)
                .join(' '),
            Cell: ({ row }: { row: { original: NNCP } }) => {
              const entries = Object.entries(row.original.nodeSelector);
              return entries.length ? (
                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                  {entries.map(([k, v]) => `${k}=${v}`).join(', ')}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  all nodes
                </Typography>
              );
            },
          },
          {
            id: 'age',
            header: 'Age',
            accessorFn: (p: NNCP) => p.metadata.creationTimestamp,
            Cell: ({ row }: { row: { original: NNCP } }) => (
              <DateLabel date={row.original.metadata.creationTimestamp} />
            ),
          },
        ]}
      />

      <CreateResourceDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Node Network Configuration Policy"
        resourceClass={NodeNetworkConfigurationPolicy}
        initialResource={INITIAL_NNCP}
        initialTab={initialTab}
        formComponent={NNCPForm}
        validate={validateNNCP}
        transform={sanitizeNNCP}
      />

      {editItem && (
        <CreateResourceDialog
          open
          onClose={() => setEditItem(null)}
          title={`Edit Policy: ${editItem.getName()}`}
          resourceClass={NodeNetworkConfigurationPolicy}
          initialResource={editItem.jsonData}
          initialTab={editTab}
          editMode
          formComponent={NNCPForm}
          validate={validateNNCP}
          transform={sanitizeNNCP}
        />
      )}

      {duplicateItem && (
        <CreateResourceDialog
          open
          onClose={() => setDuplicateItem(null)}
          title="Create a policy like this one"
          resourceClass={NodeNetworkConfigurationPolicy}
          initialResource={duplicateOf(duplicateItem.jsonData, duplicateItem.getName())}
          formComponent={NNCPForm}
          validate={validateNNCP}
          transform={sanitizeNNCP}
        />
      )}

      <DeletePolicyDialog policies={deleteItems} onClose={() => setDeleteItems([])} />
    </SectionBox>
  );
}

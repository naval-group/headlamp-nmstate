import { Icon } from '@iconify/react';
import {
  Link,
  Loader,
  NameValueTable,
  SectionBox,
  SectionHeader,
  SimpleTable,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Editor from '@monaco-editor/react';
import { Alert, AlertTitle, Box, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import * as yaml from 'js-yaml';
import React, { useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { interfaceMeta } from '../../nmstate/ifaceMeta';
import {
  NodeNetworkConfigurationEnactment,
  NodeNetworkConfigurationPolicy,
} from '../../nmstate/resources';
import ConditionsTable from '../common/ConditionsTable';
import CreateResourceDialog from '../common/CreateResourceDialog';
import DeletePolicyDialog from './DeletePolicyDialog';
import { duplicateOf } from './duplicate';
import NNCPForm, { sanitizeNNCP, validateNNCP } from './NNCPForm';
import { policyStatusColor } from './status';

export default function PolicyDetails() {
  const { name } = useParams<{ name: string }>();
  const theme = useTheme();
  const [policy, error] = NodeNetworkConfigurationPolicy.useGet(name);
  const [enactments] = NodeNetworkConfigurationEnactment.useList();
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState(0);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const history = useHistory();

  if (error) {
    return (
      <SectionBox title="Policy" backLink>
        <Alert severity="error" variant="filled">
          {String(error)}
        </Alert>
      </SectionBox>
    );
  }

  if (!policy) return <Loader title="Loading policy" />;

  const status = policy.getStatus();
  const mine = (enactments ?? []).filter(e => e.policyName === name);
  const failing = mine.filter(e => e.getFailureMessage());

  return (
    <>
      <SectionBox
        title={
          <SectionHeader
            title={`Policy: ${name}`}
            actions={[
              <Tooltip key="edit-wizard" title="Edit with Wizard">
                <IconButton
                  onClick={() => {
                    setEditTab(0);
                    setEditOpen(true);
                  }}
                  size="small"
                >
                  <Icon icon="mdi:auto-fix" width={20} />
                </IconButton>
              </Tooltip>,
              <Tooltip key="edit-yaml" title="Edit YAML">
                <IconButton
                  onClick={() => {
                    setEditTab(1);
                    setEditOpen(true);
                  }}
                  size="small"
                >
                  <Icon icon="mdi:code-braces" width={20} />
                </IconButton>
              </Tooltip>,
              <Tooltip key="duplicate" title="Create one like this">
                <IconButton onClick={() => setDuplicateOpen(true)} size="small">
                  <Icon icon="mdi:content-duplicate" width={20} />
                </IconButton>
              </Tooltip>,
              <Tooltip key="delete" title="Delete">
                <IconButton onClick={() => setDeleteOpen(true)} size="small" color="error">
                  <Icon icon="mdi:delete" width={20} />
                </IconButton>
              </Tooltip>,
            ]}
          />
        }
        backLink
      >
        {failing.length > 0 && (
          <Alert severity="error" variant="filled" sx={{ mb: 2 }}>
            <AlertTitle>
              Failing on {failing.length} node{failing.length > 1 ? 's' : ''}
            </AlertTitle>
            {failing.map(e => (
              <Typography key={e.getName()} variant="body2" sx={{ display: 'block' }}>
                <strong>{e.nodeName}</strong>: {e.getFailure().summary}
              </Typography>
            ))}
          </Alert>
        )}

        <NameValueTable
          rows={[
            {
              name: 'Status',
              value: (
                <Chip
                  size="small"
                  label={status}
                  sx={{
                    height: 22,
                    borderLeft: `3px solid ${policyStatusColor(status)}`,
                    borderRadius: 0.5,
                  }}
                />
              ),
            },
            { name: 'Reason', value: policy.getReason() || '—' },
            { name: 'Message', value: policy.getMessage() || '—' },
            {
              name: 'Node selector',
              value: Object.entries(policy.nodeSelector).length ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {Object.entries(policy.nodeSelector).map(([k, v]) => (
                    <Chip key={k} size="small" label={`${k}=${v}`} sx={{ height: 20 }} />
                  ))}
                </Box>
              ) : (
                'all nodes'
              ),
            },
            { name: 'Max unavailable', value: policy.spec?.maxUnavailable ?? '—' },
            {
              name: 'Captures',
              value: Object.keys(policy.spec?.capture ?? {}).length ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                  {Object.entries(policy.spec.capture as Record<string, string>).map(
                    ([key, expression]) => (
                      <Typography key={key} variant="caption" sx={{ fontFamily: 'monospace' }}>
                        <strong>{key}</strong>: {expression}
                      </Typography>
                    )
                  )}
                </Box>
              ) : (
                '—'
              ),
            },
            { name: 'Generation', value: policy.metadata.generation ?? '—' },
            {
              name: 'Interfaces',
              value: (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {(policy.desiredState.interfaces ?? []).map(i => (
                    <Chip
                      key={i.name}
                      size="small"
                      icon={<Icon icon={interfaceMeta(i.type).icon} width={13} />}
                      label={`${i.name} (${interfaceMeta(i.type).label})`}
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
          ]}
        />
      </SectionBox>

      <SectionBox title="Conditions">
        <ConditionsTable conditions={policy.conditions} />
      </SectionBox>

      <SectionBox title="Enactments">
        {mine.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No node has enacted this policy yet.
          </Typography>
        ) : (
          <SimpleTable
            columns={[
              {
                label: 'Node',
                getter: (e: InstanceType<typeof NodeNetworkConfigurationEnactment>) => (
                  <Link routeName="nns" params={{ name: e.nodeName }}>
                    {e.nodeName}
                  </Link>
                ),
              },
              {
                label: 'Status',
                getter: (e: InstanceType<typeof NodeNetworkConfigurationEnactment>) => (
                  <Chip
                    size="small"
                    label={e.getStatus()}
                    sx={{
                      height: 22,
                      borderLeft: `3px solid ${policyStatusColor(e.getStatus())}`,
                      borderRadius: 0.5,
                    }}
                  />
                ),
              },
              {
                label: 'Policy generation',
                getter: (e: InstanceType<typeof NodeNetworkConfigurationEnactment>) => {
                  const applied = e.policyGeneration;
                  const current = policy.metadata.generation;
                  if (applied === null) return '—';
                  // A lagging generation means the node has not caught up with
                  // the latest edit of the policy.
                  return applied === current ? (
                    String(applied)
                  ) : (
                    <Chip
                      size="small"
                      icon={<Icon icon="mdi:history" width={13} />}
                      label={`${applied} → ${current}`}
                      sx={{ height: 20, borderLeft: '3px solid #ff9800', borderRadius: 0.5 }}
                    />
                  );
                },
              },
              {
                label: '',
                getter: (e: InstanceType<typeof NodeNetworkConfigurationEnactment>) => (
                  <Link routeName="nnce" params={{ name: e.metadata.name }}>
                    Details
                  </Link>
                ),
              },
            ]}
            data={mine}
          />
        )}
      </SectionBox>

      <SectionBox title="Desired State">
        <Box
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}
        >
          <Editor
            height="45vh"
            language="yaml"
            theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
            value={yaml.dump(policy.desiredState, { lineWidth: -1, noRefs: true })}
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
      </SectionBox>

      <CreateResourceDialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit Policy: ${name}`}
        resourceClass={NodeNetworkConfigurationPolicy}
        initialResource={policy.jsonData}
        initialTab={editTab}
        editMode
        formComponent={NNCPForm}
        validate={validateNNCP}
        transform={sanitizeNNCP}
      />

      <DeletePolicyDialog
        policies={deleteOpen ? [policy] : []}
        onClose={() => setDeleteOpen(false)}
        // The page it was showing no longer exists, so go back to the list
        // rather than leaving a details view of a deleted policy on screen.
        onDeleted={() => history.push('/nmstate/policies')}
      />

      <CreateResourceDialog
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        title="Create a policy like this one"
        resourceClass={NodeNetworkConfigurationPolicy}
        initialResource={duplicateOf(policy.jsonData, name)}
        formComponent={NNCPForm}
        validate={validateNNCP}
        transform={sanitizeNNCP}
      />
    </>
  );
}

import {
  Link,
  Loader,
  NameValueTable,
  SectionBox,
} from '@kinvolk/headlamp-plugin/lib/CommonComponents';
import Editor from '@monaco-editor/react';
import { Alert, AlertTitle, Box, Chip, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import * as yaml from 'js-yaml';
import React from 'react';
import { useParams } from 'react-router-dom';
import { NodeNetworkConfigurationEnactment } from '../../nmstate/resources';
import ConditionsTable from '../common/ConditionsTable';
import NmstateLogView from '../common/NmstateLogView';
import { policyStatusColor } from '../Policies/status';

export default function EnactmentDetails() {
  const { name } = useParams<{ name: string }>();
  const theme = useTheme();
  const [enactment, error] = NodeNetworkConfigurationEnactment.useGet(name);

  if (error) {
    return (
      <SectionBox title="Enactment" backLink>
        <Alert severity="error" variant="filled">
          {String(error)}
        </Alert>
      </SectionBox>
    );
  }

  if (!enactment) return <Loader title="Loading enactment" />;

  const status = enactment.getStatus();
  const failure = enactment.getFailure();
  const retries = enactment.getRetries();

  return (
    <>
      <SectionBox title={`Enactment: ${name}`} backLink>
        {failure.detail && (
          <Alert severity="error" variant="filled" sx={{ mb: 2 }}>
            <AlertTitle>Apply failed on {enactment.nodeName}</AlertTitle>
            <Typography
              variant="body2"
              component="pre"
              sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', m: 0, fontWeight: 600 }}
            >
              {failure.summary}
            </Typography>
            {retries > 0 && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                Retried {retries} time{retries > 1 ? 's' : ''} for policy generation{' '}
                {enactment.policyGeneration}.
              </Typography>
            )}
          </Alert>
        )}

        <NameValueTable
          rows={[
            {
              name: 'Node',
              value: (
                <Link routeName="nns" params={{ name: enactment.nodeName }}>
                  {enactment.nodeName}
                </Link>
              ),
            },
            {
              name: 'Policy',
              value: (
                <Link routeName="nncp" params={{ name: enactment.policyName }}>
                  {enactment.policyName}
                </Link>
              ),
            },
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
            { name: 'Reason', value: enactment.getReason() || '—' },
            { name: 'Policy generation', value: enactment.policyGeneration ?? '—' },
            {
              name: 'Features',
              value: enactment.features.length ? (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {enactment.features.map(f => (
                    <Chip key={f} size="small" label={f} sx={{ height: 20 }} />
                  ))}
                </Box>
              ) : (
                '—'
              ),
            },
          ]}
        />
      </SectionBox>

      {failure.detail && (
        <SectionBox title="Apply log">
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            Everything nmstate printed while applying. Most of it is one line per interface it chose
            to leave alone; the errors are highlighted.
          </Typography>
          <NmstateLogView log={failure.detail} maxHeight="45vh" />
        </SectionBox>
      )}

      <SectionBox title="Conditions">
        <ConditionsTable conditions={enactment.conditions} />
      </SectionBox>

      <SectionBox title="Desired State applied on this node">
        <Box
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden' }}
        >
          <Editor
            height="45vh"
            language="yaml"
            theme={theme.palette.mode === 'dark' ? 'vs-dark' : 'light'}
            value={yaml.dump(enactment.desiredState, { lineWidth: -1, noRefs: true })}
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
    </>
  );
}

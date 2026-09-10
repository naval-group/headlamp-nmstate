import { Icon } from '@iconify/react';
import { K8s } from '@kinvolk/headlamp-plugin/lib';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  TextField,
  Typography,
} from '@mui/material';
import React, { useMemo } from 'react';
import useResourceEditor from '../../hooks/useResourceEditor';
import { NodeNetworkState } from '../../nmstate/resources';
import { NmstateInterface, NmstateRoute } from '../../nmstate/types';
import {
  checkCaptureName,
  checkDestination,
  checkInterfaceName,
  checkIpAddress,
  checkIpWithPrefix,
  checkMacAddress,
  checkMaxUnavailable,
  checkNumber,
  checkPciAddress,
  parseOptionalNumber,
  ROUTE_TABLES,
} from '../../nmstate/validation';
import FormSection from '../common/FormSection';
import MandatoryTextField from '../common/MandatoryTextField';
import StringListField from '../common/StringListField';
import { CAPTURE_TEMPLATES, captureReference } from './captureTemplates';
import InterfaceEditor from './InterfaceEditor';

/* eslint-disable @typescript-eslint/no-explicit-any */
type KubeResourceBuilder = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Props {
  resource: KubeResourceBuilder;
  onChange: (resource: KubeResourceBuilder) => void;
  editMode?: boolean;
  showErrors?: boolean;
}

/**
 * Drops the placeholder entries the form keeps around while they are typed in.
 *
 * Empty rows have to survive inside the form — removing them on the spot means
 * a freshly added one disappears before it can be filled — but an empty port
 * name or capture key is meaningless to the cluster.
 */
export function sanitizeNNCP(resource: KubeResourceBuilder): KubeResourceBuilder {
  const clone = JSON.parse(JSON.stringify(resource ?? {}));
  const desired = clone?.spec?.desiredState;

  for (const iface of desired?.interfaces ?? []) {
    if (iface?.bridge?.port) {
      iface.bridge.port = iface.bridge.port.filter((p: { name?: string }) => p?.name?.trim());
    }
    if (iface?.['link-aggregation']?.port) {
      iface['link-aggregation'].port = iface['link-aggregation'].port.filter((p: string) =>
        p?.trim()
      );
    }
    if (iface?.vrf?.port) {
      iface.vrf.port = iface.vrf.port.filter((p: string) => p?.trim());
    }
    for (const stack of ['ipv4', 'ipv6']) {
      const addresses = iface?.[stack]?.address;
      if (addresses) {
        iface[stack].address = addresses.filter((a: { ip?: string }) => a?.ip?.trim());
      }
    }
  }

  const dns = desired?.['dns-resolver']?.config;
  if (dns) {
    for (const key of ['server', 'search']) {
      if (dns[key]) dns[key] = dns[key].filter((v: string) => v?.trim());
    }
  }

  if (desired?.routes?.config) {
    desired.routes.config = desired.routes.config.filter((r: { destination?: string }) =>
      r?.destination?.trim()
    );
  }

  if (clone?.spec?.capture) {
    const captures = Object.entries(clone.spec.capture as Record<string, string>).filter(
      ([name, expression]) => name.trim() && expression?.trim()
    );
    if (captures.length) clone.spec.capture = Object.fromEntries(captures);
    else delete clone.spec.capture;
  }

  return clone;
}

/**
 * Whether the policy is complete and well-formed enough to send.
 *
 * Every rule here is one nmstate or the kernel would enforce anyway; catching
 * them in the form turns a failed enactment, discovered minutes later on a
 * node, into a disabled button.
 */
export function validateNNCP(resource: KubeResourceBuilder): boolean {
  if (!resource?.metadata?.name?.trim()) return false;
  if (!checkMaxUnavailable(String(resource?.spec?.maxUnavailable ?? '')).valid) return false;

  for (const [name] of Object.entries(resource?.spec?.capture ?? {})) {
    if (!checkCaptureName(name).valid) return false;
  }

  const interfaces: NmstateInterface[] = resource?.spec?.desiredState?.interfaces ?? [];
  if (interfaces.length === 0) return false;

  for (const iface of interfaces) {
    if (!checkInterfaceName(iface.name ?? '').valid) return false;

    // nmstate rejects an entry that says it is matched by hardware address but
    // never gives one, and a malformed address fails just as surely on the node.
    if (iface.identifier === 'mac-address' && !checkMacAddress(iface['mac-address'] ?? '').valid) {
      return false;
    }
    if (iface.identifier === 'pci-address' && !checkPciAddress(iface['pci-address'] ?? '').valid) {
      return false;
    }

    if (!checkNumber(iface.mtu, 'mtu').valid) return false;
    if (!checkNumber(iface.vlan?.id, 'vlan-id').valid) return false;
    if (!checkNumber(iface.vxlan?.id, 'vni').valid) return false;
    if (!checkNumber(iface.vxlan?.['destination-port'], 'port').valid) return false;
    if (iface.vxlan?.remote && !checkIpAddress(iface.vxlan.remote).valid) return false;

    for (const family of ['ipv4', 'ipv6'] as const) {
      for (const address of iface[family]?.address ?? []) {
        const text = `${address.ip}/${address['prefix-length']}`;
        if (!checkIpWithPrefix(text, family).valid) return false;
      }
    }

    for (const port of iface.bridge?.port ?? []) {
      if (port?.name && !checkInterfaceName(port.name).valid) return false;
    }
    for (const port of iface['link-aggregation']?.port ?? []) {
      if (port && !checkInterfaceName(port).valid) return false;
    }
  }

  const routes: NmstateRoute[] = resource?.spec?.desiredState?.routes?.config ?? [];
  for (const route of routes) {
    if (route.destination && !checkDestination(route.destination).valid) return false;
    if (route['next-hop-address'] && !checkIpAddress(route['next-hop-address']).valid) return false;
    if (!checkNumber(route.metric, 'metric').valid) return false;
  }

  for (const server of resource?.spec?.desiredState?.['dns-resolver']?.config?.server ?? []) {
    if (server && !checkIpAddress(server).valid) return false;
  }

  return true;
}

export default function NNCPForm({ resource, onChange, editMode, showErrors }: Props) {
  const { updateMetadata } = useResourceEditor(resource, onChange);
  const [nodes] = K8s.ResourceClasses.Node.useList();
  const [states] = NodeNetworkState.useList();

  const desiredState = resource?.spec?.desiredState ?? {};
  const interfaces: NmstateInterface[] = desiredState.interfaces ?? [];
  const routes: NmstateRoute[] = desiredState.routes?.config ?? [];
  const dns = desiredState['dns-resolver']?.config ?? {};
  const nodeSelector: Record<string, string> = resource?.spec?.nodeSelector ?? {};
  const captures: Record<string, string> = resource?.spec?.capture ?? {};

  const updateSpec = (patch: Record<string, unknown>) =>
    onChange({ ...resource, spec: { ...resource.spec, ...patch } });

  const updateDesiredState = (patch: Record<string, unknown>) =>
    updateSpec({ desiredState: { ...desiredState, ...patch } });

  const setInterface = (index: number, iface: NmstateInterface) =>
    updateDesiredState({ interfaces: interfaces.map((it, i) => (i === index ? iface : it)) });

  const selectorEntries = Object.entries(nodeSelector);

  /**
   * Interfaces the form can suggest when a parent interface is needed.
   *
   * Only meaningful once the policy targets a specific node: with no hostname
   * selector the policy applies cluster-wide, and offering one node's interface
   * names would be a suggestion that happens to be wrong everywhere else.
   */
  const targetNode = nodeSelector['kubernetes.io/hostname'] ?? '';
  const nodeInterfaces = useMemo(() => {
    if (!targetNode) return [];
    const state = (states ?? []).find(s => s.getName() === targetNode);
    return (state?.interfaces ?? []).map(i => i.name).filter(Boolean);
  }, [states, targetNode]);

  /** Node names, offered as the value when selecting on kubernetes.io/hostname. */
  const nodeNames = (nodes ?? []).map(n => n.getName()).sort();

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <FormSection icon="mdi:file-document-outline" title="Policy" color="policy">
        <Grid item xs={12} sm={6}>
          <MandatoryTextField
            fullWidth
            label="Name"
            value={resource?.metadata?.name ?? ''}
            onChange={e => updateMetadata('name', e.target.value)}
            disabled={editMode}
            showErrors={showErrors}
            helperText="Policy name, cluster-scoped"
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            size="small"
            label="Max unavailable"
            value={resource?.spec?.maxUnavailable ?? ''}
            onChange={e => updateSpec({ maxUnavailable: e.target.value || undefined })}
            error={!checkMaxUnavailable(String(resource?.spec?.maxUnavailable ?? '')).valid}
            helperText={
              checkMaxUnavailable(String(resource?.spec?.maxUnavailable ?? '')).message ??
              'Nodes reconfigured at once, e.g. 3 or 50%'
            }
          />
        </Grid>
      </FormSection>

      <FormSection icon="mdi:server-network" title="Node Selector" color="selector">
        <Grid item xs={12}>
          {selectorEntries.length === 0 && (
            <Alert severity="warning" variant="filled" sx={{ mb: 1 }}>
              With no selector this policy applies to <strong>every node</strong> in the cluster.
            </Alert>
          )}
          {selectorEntries.map(([key, value], index) => (
            <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
              <TextField
                size="small"
                label="Key"
                value={key}
                sx={{ flex: 1 }}
                onChange={e => {
                  const next = { ...nodeSelector };
                  delete next[key];
                  next[e.target.value] = value;
                  updateSpec({ nodeSelector: next });
                }}
              />
              <TextField
                size="small"
                label="Value"
                value={value}
                select={key === 'kubernetes.io/hostname' && nodeNames.length > 0}
                sx={{ flex: 1 }}
                onChange={e =>
                  updateSpec({ nodeSelector: { ...nodeSelector, [key]: e.target.value } })
                }
              >
                {key === 'kubernetes.io/hostname' &&
                  nodeNames.map(n => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
              </TextField>
              <IconButton
                size="small"
                aria-label="Remove selector"
                onClick={() => {
                  const next = { ...nodeSelector };
                  delete next[key];
                  updateSpec({ nodeSelector: next });
                }}
              >
                <Icon icon="mdi:close" width={18} />
              </IconButton>
            </Box>
          ))}
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              size="small"
              startIcon={<Icon icon="mdi:plus" width={16} />}
              onClick={() => updateSpec({ nodeSelector: { ...nodeSelector, '': '' } })}
            >
              Add selector
            </Button>
            {!('kubernetes.io/hostname' in nodeSelector) && (
              <Button
                size="small"
                startIcon={<Icon icon="mdi:server" width={16} />}
                onClick={() =>
                  updateSpec({
                    nodeSelector: {
                      ...nodeSelector,
                      'kubernetes.io/hostname': nodeNames[0] ?? '',
                    },
                  })
                }
              >
                Target a single node
              </Button>
            )}
          </Box>
        </Grid>
      </FormSection>

      <FormSection
        icon="mdi:variable"
        title="Captures"
        color="advanced"
        noGrid
        defaultExpanded={Object.keys(captures).length > 0}
      >
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          A capture names an NMPolicy expression that is evaluated against each node, so one policy
          can adapt to nodes that differ. Reference a capture from the desired state as{' '}
          <code>{'{{ capture.<name>.<path> }}'}</code> — for example capturing{' '}
          <code>default-gw</code> as <code>routes.running.destination==&quot;0.0.0.0/0&quot;</code>{' '}
          lets an interface be named <code>{'{{ capture.base-iface.interfaces.0.name }}'}</code>{' '}
          rather than hardcoded.
        </Typography>

        {editMode && (
          <Alert severity="info" variant="filled" sx={{ mb: 1.5 }}>
            Captures cannot be changed once a policy exists. To alter them, delete the policy and
            create it again.
          </Alert>
        )}

        {Object.entries(captures).map(([name, expression], index) => (
          <Box key={index} sx={{ display: 'flex', gap: 1, mb: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              label="Name"
              value={name}
              disabled={editMode}
              error={Boolean(name) && !checkCaptureName(name).valid}
              helperText={name ? checkCaptureName(name).message : undefined}
              sx={{ flex: '0 0 200px' }}
              onChange={e => {
                const next: Record<string, string> = {};
                for (const [k, v] of Object.entries(captures)) {
                  next[k === name ? e.target.value : k] = v;
                }
                updateSpec({ capture: next });
              }}
            />
            <TextField
              size="small"
              label="Expression"
              value={expression}
              disabled={editMode}
              sx={{ flex: 1 }}
              placeholder={'routes.running.destination=="0.0.0.0/0"'}
              onChange={e => updateSpec({ capture: { ...captures, [name]: e.target.value } })}
            />
            <IconButton
              size="small"
              disabled={editMode}
              aria-label="Remove capture"
              onClick={() => {
                const next = { ...captures };
                delete next[name];
                updateSpec({ capture: Object.keys(next).length ? next : undefined });
              }}
            >
              <Icon icon="mdi:close" width={18} />
            </IconButton>
          </Box>
        ))}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Button
            size="small"
            disabled={editMode}
            startIcon={<Icon icon="mdi:plus" width={16} />}
            onClick={() => updateSpec({ capture: { ...captures, '': '' } })}
          >
            Add empty capture
          </Button>
          <TextField
            select
            size="small"
            label="Add from a template"
            value=""
            disabled={editMode}
            sx={{ minWidth: 300 }}
            onChange={e => {
              const template = CAPTURE_TEMPLATES.find(t => t.name === e.target.value);
              if (!template) return;
              // Keep the template's own name free: adding the same one twice
              // would otherwise silently overwrite the first.
              let name = template.name;
              let suffix = 2;
              while (name in captures) name = `${template.name}-${suffix++}`;
              updateSpec({ capture: { ...captures, [name]: template.expression } });
            }}
          >
            {CAPTURE_TEMPLATES.map(template => (
              <MenuItem key={template.name} value={template.name} sx={{ display: 'block', py: 1 }}>
                <Typography variant="body2">{template.label}</Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                  {template.description}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontFamily: 'monospace', display: 'block', opacity: 0.8 }}
                >
                  {template.expression}
                </Typography>
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {Object.keys(captures).length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              Reference these from the desired state as:
            </Typography>
            {Object.entries(captures)
              .filter(([name]) => name)
              .map(([name, expression]) => (
                <Typography
                  key={name}
                  variant="caption"
                  sx={{ display: 'block', fontFamily: 'monospace' }}
                >
                  {captureReference(name, expression)}
                </Typography>
              ))}
          </Box>
        )}
      </FormSection>

      <FormSection icon="mdi:lan" title="Interfaces" color="interface" noGrid>
        {interfaces.length === 0 && (
          <Alert severity="info" variant="filled" sx={{ mb: 2 }}>
            A policy needs at least one interface. Anything the form does not cover can be added on
            the Editor tab — unknown fields are preserved.
          </Alert>
        )}
        {interfaces.map((iface, index) => (
          <InterfaceEditor
            key={index}
            iface={iface}
            index={index}
            candidates={[
              ...new Set([
                ...interfaces
                  .filter((_, i) => i !== index)
                  .map(i => i.name)
                  .filter(Boolean),
                ...nodeInterfaces,
              ]),
            ]}
            showErrors={showErrors}
            onChange={next => setInterface(index, next)}
            onRemove={() =>
              updateDesiredState({ interfaces: interfaces.filter((_, i) => i !== index) })
            }
          />
        ))}
        <Button
          variant="outlined"
          startIcon={<Icon icon="mdi:plus" width={18} />}
          onClick={() =>
            updateDesiredState({
              interfaces: [
                ...interfaces,
                {
                  name: '',
                  type: 'linux-bridge',
                  state: 'up',
                  ipv4: { enabled: false },
                  ipv6: { enabled: false },
                },
              ],
            })
          }
        >
          Add interface
        </Button>
      </FormSection>

      <FormSection icon="mdi:routes" title="Routes" color="routes" noGrid defaultExpanded={false}>
        {routes.map((route, index) => (
          <Paper key={index} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  size="small"
                  label="Destination"
                  value={route.destination ?? ''}
                  placeholder="0.0.0.0/0"
                  error={Boolean(route.destination) && !checkDestination(route.destination).valid}
                  helperText={
                    route.destination ? checkDestination(route.destination).message : undefined
                  }
                  onChange={e =>
                    updateDesiredState({
                      routes: {
                        ...desiredState.routes,
                        config: routes.map((r, i) =>
                          i === index ? { ...r, destination: e.target.value } : r
                        ),
                      },
                    })
                  }
                />
              </Grid>
              <Grid item xs={12} sm={2}>
                <TextField
                  fullWidth
                  size="small"
                  label="Next hop address"
                  value={route['next-hop-address'] ?? ''}
                  error={
                    Boolean(route['next-hop-address']) &&
                    !checkIpAddress(route['next-hop-address']).valid
                  }
                  helperText={
                    route['next-hop-address']
                      ? checkIpAddress(route['next-hop-address']).message
                      : undefined
                  }
                  onChange={e =>
                    updateDesiredState({
                      routes: {
                        ...desiredState.routes,
                        config: routes.map((r, i) =>
                          i === index ? { ...r, 'next-hop-address': e.target.value } : r
                        ),
                      },
                    })
                  }
                />
              </Grid>
              <Grid item xs={12} sm={3}>
                <TextField
                  fullWidth
                  size="small"
                  select={interfaces.length + nodeInterfaces.length > 0}
                  label="Next hop interface"
                  value={route['next-hop-interface'] ?? ''}
                  error={
                    Boolean(route['next-hop-interface']) &&
                    !checkInterfaceName(route['next-hop-interface']).valid
                  }
                  onChange={e =>
                    updateDesiredState({
                      routes: {
                        ...desiredState.routes,
                        config: routes.map((r, i) =>
                          i === index ? { ...r, 'next-hop-interface': e.target.value } : r
                        ),
                      },
                    })
                  }
                >
                  {[
                    ...new Set([...interfaces.map(i => i.name).filter(Boolean), ...nodeInterfaces]),
                  ].map(n => (
                    <MenuItem key={n} value={n}>
                      {n}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={6} sm={1}>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Metric"
                  value={route.metric ?? ''}
                  error={!checkNumber(route.metric, 'metric').valid}
                  helperText={checkNumber(route.metric, 'metric').message}
                  onChange={e =>
                    updateDesiredState({
                      routes: {
                        ...desiredState.routes,
                        config: routes.map((r, i) =>
                          i === index ? { ...r, metric: parseOptionalNumber(e.target.value) } : r
                        ),
                      },
                    })
                  }
                />
              </Grid>
              <Grid item xs={6} sm={2}>
                {/*
                  The well-known tables are offered by name, but the field stays
                  free text: policy routing routinely uses tables of its own.
                */}
                <Autocomplete
                  freeSolo
                  fullWidth
                  size="small"
                  options={ROUTE_TABLES.map(t => t.label)}
                  value={route['table-id'] === undefined ? '' : String(route['table-id'])}
                  onInputChange={(_, v) => {
                    const id = Number((v.match(/^\d+/) ?? [])[0]);
                    updateDesiredState({
                      routes: {
                        ...desiredState.routes,
                        config: routes.map((r, i) =>
                          i === index
                            ? { ...r, 'table-id': Number.isFinite(id) ? id : undefined }
                            : r
                        ),
                      },
                    });
                  }}
                  renderInput={params => <TextField {...params} label="Route table" />}
                />
              </Grid>
              <Grid item xs={12} sm={1}>
                <IconButton
                  size="small"
                  aria-label="Remove route"
                  onClick={() =>
                    updateDesiredState({
                      routes: {
                        ...desiredState.routes,
                        config: routes.filter((_, i) => i !== index),
                      },
                    })
                  }
                >
                  <Icon icon="mdi:close" width={18} />
                </IconButton>
              </Grid>
            </Grid>
          </Paper>
        ))}
        <Button
          size="small"
          startIcon={<Icon icon="mdi:plus" width={16} />}
          onClick={() =>
            updateDesiredState({
              routes: { ...desiredState.routes, config: [...routes, { destination: '0.0.0.0/0' }] },
            })
          }
        >
          Add route
        </Button>
      </FormSection>

      <FormSection icon="mdi:dns-outline" title="DNS" color="dns" noGrid defaultExpanded={false}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <StringListField
              label="Servers"
              values={dns.server ?? []}
              onChange={server =>
                updateDesiredState({
                  'dns-resolver': {
                    ...desiredState['dns-resolver'],
                    config: { ...dns, server },
                  },
                })
              }
              placeholder="192.168.0.1"
              addLabel="Add server"
              validate={v => checkIpAddress(v).message ?? null}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <StringListField
              label="Search domains"
              values={dns.search ?? []}
              onChange={search =>
                updateDesiredState({
                  'dns-resolver': {
                    ...desiredState['dns-resolver'],
                    config: { ...dns, search },
                  },
                })
              }
              placeholder="example.com"
              addLabel="Add domain"
            />
          </Grid>
        </Grid>
      </FormSection>

      <Typography variant="caption" color="text.secondary">
        Fields this form does not cover — ethtool, LLDP, OVS database entries, route rules — are
        preserved when you switch to the Editor tab.
      </Typography>
    </Box>
  );
}

import { Icon } from '@iconify/react';
import {
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import React, { useState } from 'react';
import { interfaceMeta } from '../../nmstate/ifaceMeta';
import { NmstateInterface } from '../../nmstate/types';
import {
  checkInterfaceName,
  checkIpAddress,
  checkIpWithPrefix,
  checkMacAddress,
  checkNumber,
  checkPciAddress,
  MAX_INTERFACE_NAME,
  NUMERIC_BOUNDS,
  NumericField,
  parseOptionalNumber,
} from '../../nmstate/validation';
import StringListField from '../common/StringListField';
import { BOND_MODE_INFO, BOND_MODES, conflictFor, optionsForMode } from './bondOptions';
import DesiredStateControl from './DesiredStateControl';
import PropertyEditor from './PropertyEditor';

/** Interface types the form can build. Read-only kinds such as veth are omitted. */
export const CREATABLE_TYPES = [
  'ethernet',
  'linux-bridge',
  'ovs-bridge',
  'bond',
  'vlan',
  'vxlan',
  'mac-vlan',
  'ipvlan',
  'vrf',
  'dummy',
  'loopback',
] as const;

const VLAN_PROTOCOLS = ['802.1q', '802.1ad'];
const MACVLAN_MODES = ['vepa', 'bridge', 'private', 'passthru', 'source'];
const IPVLAN_MODES = ['l2', 'l3', 'l3s'];

/**
 * How nmstate matches a policy entry to a real device.
 *
 * Matching on hardware address or PCI slot turns `name` into a label you
 * choose, which other interfaces then reference — a bond can list `port2`
 * without anyone knowing what the kernel called that card on that node.
 */
const IDENTIFIERS = [
  {
    value: 'name',
    label: 'Kernel name',
    help: 'Match the interface the kernel already calls by this name.',
  },
  {
    value: 'mac-address',
    label: 'MAC address',
    help: 'Match the card by hardware address; the name becomes a label you choose.',
  },
  {
    value: 'pci-address',
    label: 'PCI address',
    help: 'Match the card by slot; the name becomes a label you choose.',
  },
];

/**
 * The key each type keeps its own settings under.
 *
 * Switching type has to drop the previous type's block: left behind, a bridge's
 * spanning-tree settings travelled with the interface and were serialised onto
 * an ethernet, which is neither meaningful nor what anyone asked for.
 */
const TYPE_BLOCKS: Record<string, string> = {
  'linux-bridge': 'bridge',
  'ovs-bridge': 'bridge',
  bond: 'link-aggregation',
  vlan: 'vlan',
  vxlan: 'vxlan',
  'mac-vlan': 'mac-vlan',
  ipvlan: 'ipvlan',
  vrf: 'vrf',
  ethernet: 'ethernet',
};

/** Types that enslave other interfaces, and so get a member list. */
const HAS_MEMBERS = new Set(['linux-bridge', 'ovs-bridge', 'bond', 'vrf']);
/** Types layered on a single interface, and so get a parent. */
const HAS_PARENT = new Set(['vlan', 'vxlan', 'mac-vlan', 'ipvlan']);

interface Props {
  iface: NmstateInterface;
  index: number;
  /**
   * Interface names that can legitimately be referenced here: the other
   * interfaces this policy declares, plus whatever exists on the selected node.
   */
  candidates: string[];
  onChange: (iface: NmstateInterface) => void;
  onRemove: () => void;
  showErrors?: boolean;
}

/** A labelled band separating one concern of the interface from the next. */
function Band({ label }: { label: string }) {
  return (
    <Grid item xs={12}>
      <Divider sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
      </Divider>
    </Grid>
  );
}

/**
 * Editor for one entry of `desiredState.interfaces`.
 *
 * The layout is deliberately fixed: type, then desired state, then identity,
 * then whatever this type attaches to, then addressing. Every type puts the
 * same field in the same place — the previous version let the grid reflow, so
 * MTU and the IP toggles moved depending on whether the type happened to have
 * options of its own, and picking a different identifier shifted the state
 * control halfway across the card.
 */
export default function InterfaceEditor({
  iface,
  index,
  candidates,
  onChange,
  onRemove,
  showErrors,
}: Props) {
  const meta = interfaceMeta(iface.type);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const set = (patch: Partial<NmstateInterface>) => onChange({ ...iface, ...patch });

  const changeType = (next: string) => {
    const previous = TYPE_BLOCKS[iface.type ?? ''];
    const cleaned = { ...iface, type: next };
    if (previous && previous !== TYPE_BLOCKS[next]) delete cleaned[previous];
    onChange(cleaned);
  };

  const setNested = (key: string, patch: Record<string, unknown>) =>
    onChange({
      ...iface,
      [key]: { ...((iface[key] as Record<string, unknown>) ?? {}), ...patch },
    });

  const ipv4 = iface.ipv4 ?? {};
  const ipv6 = iface.ipv6 ?? {};

  /** Addresses are edited as `ip/prefix` strings and split back on save. */
  const addressStrings = (stack: typeof ipv4) =>
    (stack.address ?? []).map(a => `${a.ip}/${a['prefix-length']}`);

  const parseAddresses = (values: string[]) =>
    values.map(v => {
      const [ip, prefix] = v.split('/');
      return { ip: (ip ?? '').trim(), 'prefix-length': Number(prefix) || 24 };
    });

  const identifier = iface.identifier ?? 'name';
  const nameCheck = checkInterfaceName(iface.name ?? '');
  // Only complain about a name once something has been typed, or once the
  // dialog has asked for the whole form to show its errors.
  const nameError = (showErrors || Boolean(iface.name)) && !nameCheck.valid;

  /**
   * Props shared by every bounded numeric field.
   *
   * Clearing one now means "not set" rather than zero, and a value outside the
   * range nmstate accepts is refused here instead of at apply time.
   */
  const numeric = (field: NumericField, value: number | undefined) => {
    const check = checkNumber(value, field);
    const { min, max } = NUMERIC_BOUNDS[field];
    return {
      type: 'number' as const,
      value: value === undefined ? '' : String(value),
      error: !check.valid,
      helperText: check.message,
      inputProps: { min, max },
    };
  };
  // nmstate rejects `identifier: mac-address` with no mac-address outright.
  const addressValue =
    identifier === 'mac-address' ? iface['mac-address'] ?? '' : iface['pci-address'] ?? '';
  const addressCheck =
    identifier === 'mac-address' ? checkMacAddress(addressValue) : checkPciAddress(addressValue);
  const addressError = (showErrors || Boolean(addressValue)) && !addressCheck.valid;

  const type = iface.type ?? '';
  // vlan, vxlan, mac-vlan and ipvlan all hold their parent under a key named
  // after the type itself.
  const parentValue = (iface[type] as { 'base-iface'?: string } | undefined)?.['base-iface'] ?? '';

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        mb: 2,
        borderLeft: `4px solid ${meta.color}`,
        backgroundColor: alpha(meta.color, 0.04),
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
        <Icon icon={meta.icon} width={22} color={meta.color} />
        <Typography variant="subtitle1" sx={{ flex: 1 }}>
          {iface.name || `Interface ${index + 1}`}
        </Typography>
        <Chip size="small" label={meta.label} sx={{ backgroundColor: alpha(meta.color, 0.2) }} />
        <Tooltip title="Remove from this policy">
          <IconButton
            size="small"
            onClick={() => setConfirmRemove(true)}
            aria-label="Remove interface"
          >
            <Icon icon="mdi:trash-can-outline" width={18} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* 1. Type */}
      <Typography variant="caption" color="text.secondary">
        Interface type
      </Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 1,
          mt: 0.5,
          mb: 2,
        }}
      >
        {CREATABLE_TYPES.map(option => {
          const m = interfaceMeta(option);
          const selected = iface.type === option;
          return (
            <Paper
              key={option}
              variant="outlined"
              onClick={() => changeType(option)}
              sx={{
                p: 1,
                cursor: 'pointer',
                textAlign: 'center',
                borderColor: selected ? m.color : 'divider',
                borderWidth: selected ? 2 : 1,
                backgroundColor: selected ? alpha(m.color, 0.12) : 'transparent',
                '&:hover': { backgroundColor: alpha(m.color, 0.08) },
              }}
            >
              <Icon icon={m.icon} width={20} color={m.color} />
              <Typography variant="caption" sx={{ display: 'block' }}>
                {m.label}
              </Typography>
            </Paper>
          );
        })}
      </Box>

      {/* 2. Desired state, immediately under the type on every interface. */}
      <Box sx={{ mb: 1 }}>
        <DesiredStateControl value={iface.state ?? 'up'} onChange={state => set({ state })} />
      </Box>

      <Grid container spacing={2}>
        <Band label="Identity" />

        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            size="small"
            required
            label="Name"
            value={iface.name ?? ''}
            onChange={e => set({ name: e.target.value })}
            error={nameError}
            inputProps={{ maxLength: MAX_INTERFACE_NAME }}
            helperText={
              nameError
                ? 'Interface name is required'
                : identifier === 'name'
                ? 'e.g. br01, bond0, eth0.100'
                : 'A label you choose; other interfaces reference it by this name'
            }
          />
        </Grid>

        <Grid item xs={12} sm={4}>
          <TextField
            select
            fullWidth
            size="small"
            label="Identified by"
            value={identifier}
            onChange={e => {
              const value = e.target.value as NmstateInterface['identifier'];
              set(value === 'name' ? { identifier: undefined } : { identifier: value });
            }}
            helperText={IDENTIFIERS.find(i => i.value === identifier)?.help}
          >
            {IDENTIFIERS.map(option => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        {/* MTU keeps this slot on every type, whatever else the card shows. */}
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            size="small"
            label="MTU"
            {...numeric('mtu', iface.mtu)}
            helperText={checkNumber(iface.mtu, 'mtu').message ?? 'Blank keeps the kernel default'}
            onChange={e => set({ mtu: parseOptionalNumber(e.target.value) })}
          />
        </Grid>

        {identifier !== 'name' && (
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              required
              size="small"
              label={identifier === 'mac-address' ? 'MAC address' : 'PCI address'}
              value={addressValue}
              placeholder={identifier === 'mac-address' ? 'B0:7B:25:0D:51:4E' : '0000:00:1f.6'}
              error={addressError}
              onChange={e =>
                set(
                  identifier === 'mac-address'
                    ? { 'mac-address': e.target.value }
                    : { 'pci-address': e.target.value }
                )
              }
              helperText={
                addressError
                  ? addressCheck.message
                  : 'The device this entry resolves to on each node'
              }
            />
          </Grid>
        )}

        {/* 3. What this interface attaches to, always its own band. */}
        {(HAS_MEMBERS.has(type) || HAS_PARENT.has(type)) && (
          <>
            <Band label="Attached interfaces" />

            {HAS_PARENT.has(type) && (
              <Grid item xs={12} sm={4}>
                <Autocomplete
                  freeSolo
                  fullWidth
                  size="small"
                  options={candidates}
                  value={parentValue}
                  onInputChange={(_, v) => setNested(type, { 'base-iface': v })}
                  renderInput={params => (
                    <TextField
                      {...params}
                      label="Parent interface"
                      error={Boolean(parentValue) && !checkInterfaceName(parentValue).valid}
                      helperText={
                        (parentValue && checkInterfaceName(parentValue).message) ||
                        (candidates.length
                          ? 'Suggestions come from the selected node and this policy'
                          : 'Select a node to get suggestions')
                      }
                    />
                  )}
                />
              </Grid>
            )}

            {HAS_MEMBERS.has(type) && (
              <Grid item xs={12} sm={8}>
                <StringListField
                  label="Member interfaces"
                  addLabel="Add member interface"
                  helperText="Interfaces this one takes over"
                  options={candidates}
                  validate={v => checkInterfaceName(v).message ?? null}
                  placeholder="enp1s0f0"
                  values={
                    type === 'bond'
                      ? iface['link-aggregation']?.port ?? []
                      : type === 'vrf'
                      ? iface.vrf?.port ?? []
                      : (iface.bridge?.port ?? []).map(p => p.name)
                  }
                  /*
                    Empty entries are kept while editing: filtering them here
                    meant a freshly added row was removed before it could be
                    typed into. They are dropped when the policy is serialised.
                  */
                  onChange={names => {
                    if (type === 'bond') setNested('link-aggregation', { port: names });
                    else if (type === 'vrf') setNested('vrf', { port: names });
                    else setNested('bridge', { port: names.map(name => ({ name })) });
                  }}
                />
              </Grid>
            )}
          </>
        )}

        {/* 4. Options peculiar to this type. */}
        {(type === 'linux-bridge' ||
          type === 'ovs-bridge' ||
          type === 'bond' ||
          type === 'vlan' ||
          type === 'vxlan' ||
          type === 'mac-vlan' ||
          type === 'ipvlan' ||
          type === 'vrf') && <Band label={`${meta.label} options`} />}

        {(type === 'linux-bridge' || type === 'ovs-bridge') && (
          <Grid item xs={12} sm={4}>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={Boolean(
                    (iface.bridge?.options as { stp?: { enabled?: boolean } })?.stp?.enabled
                  )}
                  onChange={e =>
                    setNested('bridge', {
                      options: {
                        ...(iface.bridge?.options ?? {}),
                        stp: { enabled: e.target.checked },
                      },
                    })
                  }
                />
              }
              label={<Typography variant="body2">Spanning Tree Protocol</Typography>}
            />
          </Grid>
        )}

        {type === 'bond' && (
          <>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                fullWidth
                size="small"
                label="Mode"
                value={iface['link-aggregation']?.mode ?? 'active-backup'}
                onChange={e => setNested('link-aggregation', { mode: e.target.value })}
                helperText="Decides which further options apply"
              >
                {BOND_MODES.map(m => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={8}>
              {(() => {
                const info = BOND_MODE_INFO[iface['link-aggregation']?.mode ?? 'active-backup'];
                if (!info) return null;
                const needsSwitch = info.needsSwitchConfig;
                return (
                  <Box
                    sx={{
                      p: 1.25,
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      backgroundColor: 'action.hover',
                    }}
                  >
                    <Box sx={{ display: 'flex', gap: 0.75, mb: 0.5 }}>
                      <Icon
                        icon={needsSwitch ? 'mdi:switch' : 'mdi:check-circle-outline'}
                        width={16}
                        style={{ flexShrink: 0, marginTop: 2 }}
                      />
                      <Typography variant="caption">
                        <strong>On the switch:</strong> {info.switchSide}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.75 }}>
                      <Icon
                        icon="mdi:swap-horizontal"
                        width={16}
                        style={{ flexShrink: 0, marginTop: 2 }}
                      />
                      <Typography variant="caption">
                        <strong>Traffic:</strong> {info.traffic}
                      </Typography>
                    </Box>
                  </Box>
                );
              })()}
            </Grid>
            <Grid item xs={12}>
              <PropertyEditor
                available={optionsForMode(iface['link-aggregation']?.mode ?? 'active-backup')}
                values={(iface['link-aggregation']?.options as Record<string, unknown>) ?? {}}
                members={iface['link-aggregation']?.port ?? []}
                conflict={conflictFor}
                addLabel="Add bond option"
                emptyHint="A bond needs no options beyond its mode. Add one when the default behaviour is not what you want."
                onChange={next =>
                  setNested('link-aggregation', {
                    options: Object.keys(next).length ? next : undefined,
                  })
                }
              />
            </Grid>
          </>
        )}

        {type === 'vlan' && (
          <>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="VLAN ID"
                {...numeric('vlan-id', iface.vlan?.id)}
                helperText={checkNumber(iface.vlan?.id, 'vlan-id').message ?? '1–4094'}
                onChange={e => setNested('vlan', { id: parseOptionalNumber(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                select
                fullWidth
                size="small"
                label="Protocol"
                value={iface.vlan?.protocol ?? '802.1q'}
                onChange={e => setNested('vlan', { protocol: e.target.value })}
              >
                {VLAN_PROTOCOLS.map(p => (
                  <MenuItem key={p} value={p}>
                    {p}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </>
        )}

        {type === 'vxlan' && (
          <>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="VNI"
                {...numeric('vni', iface.vxlan?.id)}
                onChange={e => setNested('vxlan', { id: parseOptionalNumber(e.target.value) })}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="Remote"
                value={iface.vxlan?.remote ?? ''}
                onChange={e => setNested('vxlan', { remote: e.target.value })}
                error={Boolean(iface.vxlan?.remote) && !checkIpAddress(iface.vxlan.remote).valid}
                helperText={
                  (iface.vxlan?.remote && checkIpAddress(iface.vxlan.remote).message) ||
                  'Peer or multicast group'
                }
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField
                fullWidth
                size="small"
                label="UDP port"
                {...numeric('port', iface.vxlan?.['destination-port'])}
                helperText={
                  checkNumber(iface.vxlan?.['destination-port'], 'port').message ??
                  '4789 by default'
                }
                onChange={e =>
                  setNested('vxlan', { 'destination-port': parseOptionalNumber(e.target.value) })
                }
              />
            </Grid>
          </>
        )}

        {(type === 'mac-vlan' || type === 'ipvlan') && (
          <Grid item xs={12} sm={4}>
            <TextField
              select
              fullWidth
              size="small"
              label="Mode"
              value={
                (iface[type] as { mode?: string } | undefined)?.mode ??
                (type === 'ipvlan' ? 'l2' : 'bridge')
              }
              onChange={e => setNested(type, { mode: e.target.value })}
            >
              {(type === 'ipvlan' ? IPVLAN_MODES : MACVLAN_MODES).map(m => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}

        {type === 'vrf' && (
          <Grid item xs={12} sm={4}>
            <TextField
              fullWidth
              size="small"
              type="number"
              label="Route table ID"
              value={iface.vrf?.['route-table-id'] ?? ''}
              onChange={e =>
                setNested('vrf', { 'route-table-id': parseOptionalNumber(e.target.value) })
              }
            />
          </Grid>
        )}

        {/* 5. Addressing, always last and always side by side. */}
        <Band label="Addressing" />

        <Grid item xs={12} sm={6}>
          <Typography variant="caption" color="text.secondary">
            IPv4
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
            <FormControlLabel
              sx={{ ml: 0 }}
              control={
                <Switch
                  size="small"
                  checked={Boolean(ipv4.enabled)}
                  onChange={e => setNested('ipv4', { enabled: e.target.checked })}
                />
              }
              label={<Typography variant="body2">Enabled</Typography>}
            />
            {ipv4.enabled && (
              <FormControlLabel
                sx={{ ml: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={Boolean(ipv4.dhcp)}
                    onChange={e => setNested('ipv4', { dhcp: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">DHCP</Typography>}
              />
            )}
          </Box>
          {ipv4.enabled && (
            <>
              {!ipv4.dhcp && (
                <StringListField
                  label="Addresses"
                  values={addressStrings(ipv4)}
                  onChange={v => setNested('ipv4', { address: parseAddresses(v) })}
                  placeholder="192.168.0.10/24"
                  addLabel="Add address"
                  validate={v => checkIpWithPrefix(v, 'ipv4').message ?? null}
                />
              )}
            </>
          )}
        </Grid>

        <Grid item xs={12} sm={6}>
          <Typography variant="caption" color="text.secondary">
            IPv6
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mt: 0.5 }}>
            <FormControlLabel
              sx={{ ml: 0 }}
              control={
                <Switch
                  size="small"
                  checked={Boolean(ipv6.enabled)}
                  onChange={e => setNested('ipv6', { enabled: e.target.checked })}
                />
              }
              label={<Typography variant="body2">Enabled</Typography>}
            />
            {ipv6.enabled && (
              <FormControlLabel
                sx={{ ml: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={Boolean(ipv6.autoconf)}
                    onChange={e => setNested('ipv6', { autoconf: e.target.checked })}
                  />
                }
                label={<Typography variant="body2">Autoconf (SLAAC)</Typography>}
              />
            )}
          </Box>
          {ipv6.enabled && (
            <>
              {!ipv6.autoconf && (
                <StringListField
                  label="Addresses"
                  values={addressStrings(ipv6)}
                  onChange={v => setNested('ipv6', { address: parseAddresses(v) })}
                  placeholder="fd00::10/64"
                  addLabel="Add address"
                  validate={v => checkIpWithPrefix(v, 'ipv6').message ?? null}
                />
              )}
            </>
          )}
        </Grid>
      </Grid>

      {/*
        Dropping an interface from a policy is not the same as deleting it from
        the node, and confusing the two is how a bridge ends up outliving the
        policy that created it. nmstate only ever creates and updates unless it
        is told `state: absent`, so the dialog offers that as the alternative.
      */}
      <Dialog open={confirmRemove} onClose={() => setConfirmRemove(false)} maxWidth="sm">
        <DialogContent>
          <DialogContentText component="div">
            <Typography variant="h6" gutterBottom>
              Remove {iface.name || 'this interface'} from the policy?
            </Typography>
            <p>
              This removes the interface from the policy document only. The configuration already
              applied stays in place on every node — nmstate does not undo what a policy stopped
              asking for.
            </p>
            <p>
              To actually tear the interface down on the nodes, keep it in the policy and set its
              desired state to <strong>absent</strong> instead, then apply the policy once before
              removing it.
            </p>
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
          <Button
            onClick={() => {
              set({ state: 'absent' });
              setConfirmRemove(false);
            }}
          >
            Set to absent instead
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => {
              setConfirmRemove(false);
              onRemove();
            }}
          >
            Remove from policy
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

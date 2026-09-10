import { Provenance } from './topology';

export interface InterfaceTypeMeta {
  label: string;
  icon: string;
  /** Accent colour, applied to the node border and icon. */
  color: string;
  /** Shown in the legend and the details panel. */
  description: string;
}

/**
 * Visual identity per interface type.
 *
 * Colours group by role rather than by name: physical links are steel, overlays
 * cyan, tagging amber, aggregation purple, bridges blue. That way the layered
 * topology reads by colour band even before the labels are legible.
 */
export const INTERFACE_TYPES: Record<string, InterfaceTypeMeta> = {
  ethernet: {
    label: 'Ethernet',
    icon: 'mdi:ethernet',
    color: '#607d8b',
    description: 'Physical network interface',
  },
  'linux-bridge': {
    label: 'Linux Bridge',
    icon: 'mdi:bridge',
    color: '#2196f3',
    description: 'Software L2 bridge switching between its ports',
  },
  'ovs-bridge': {
    label: 'OVS Bridge',
    icon: 'mdi:bridge',
    color: '#3f51b5',
    description: 'Open vSwitch bridge',
  },
  'ovs-interface': {
    label: 'OVS Interface',
    icon: 'mdi:lan-connect',
    color: '#3f51b5',
    description: 'Internal port of an Open vSwitch bridge',
  },
  bond: {
    label: 'Bond',
    icon: 'mdi:vector-combine',
    color: '#9c27b0',
    description: 'Link aggregation across several ports',
  },
  vlan: {
    label: 'VLAN',
    icon: 'mdi:tag-outline',
    color: '#ff9800',
    description: '802.1q tagged sub-interface',
  },
  vxlan: {
    label: 'VXLAN',
    icon: 'mdi:tunnel-outline',
    color: '#00bcd4',
    description: 'L2 overlay tunnelled over UDP',
  },
  veth: {
    label: 'veth',
    icon: 'mdi:vector-polyline',
    color: '#78909c',
    description: 'Virtual ethernet pair, typically one end inside a pod',
  },
  'mac-vlan': {
    label: 'MACVLAN',
    icon: 'mdi:lan',
    color: '#4caf50',
    description: 'Sub-interface with its own MAC address',
  },
  'mac-vtap': {
    label: 'MACVTAP',
    icon: 'mdi:lan',
    color: '#4caf50',
    description: 'MACVLAN exposed as a tap device',
  },
  ipvlan: {
    label: 'IPVLAN',
    icon: 'mdi:ip-network-outline',
    color: '#4caf50',
    description: 'Sub-interface sharing the parent MAC',
  },
  vrf: {
    label: 'VRF',
    icon: 'mdi:table-network',
    color: '#ff5722',
    description: 'Virtual routing and forwarding domain',
  },
  infiniband: {
    label: 'InfiniBand',
    icon: 'mdi:transit-connection-variant',
    color: '#795548',
    description: 'InfiniBand interface',
  },
  loopback: {
    label: 'Loopback',
    icon: 'mdi:backup-restore',
    color: '#9e9e9e',
    description: 'Host loopback interface',
  },
  dummy: {
    label: 'Dummy',
    icon: 'mdi:help-network-outline',
    color: '#9e9e9e',
    description: 'Dummy interface',
  },
  tun: {
    label: 'TUN/TAP',
    icon: 'mdi:security-network',
    color: '#009688',
    description: 'Userspace tunnel device',
  },
  macsec: {
    label: 'MACsec',
    icon: 'mdi:shield-lock-outline',
    color: '#f44336',
    description: 'Encrypted MACsec link',
  },
  hsr: {
    label: 'HSR',
    icon: 'mdi:sync',
    color: '#607d8b',
    description: 'High-availability seamless redundancy',
  },
};

const UNKNOWN_TYPE: InterfaceTypeMeta = {
  label: 'Unknown',
  icon: 'mdi:help-network-outline',
  color: '#9e9e9e',
  description: 'Interface type not recognised by this plugin',
};

/**
 * Reading order for the list view: physical links first, then what is layered
 * on them, then the bridges those feed, then the pod-facing ends. It follows
 * the path a packet takes rather than the alphabet.
 */
const TYPE_ORDER = [
  'ethernet',
  'infiniband',
  'bond',
  'vxlan',
  'vlan',
  'mac-vlan',
  'mac-vtap',
  'ipvlan',
  'tun',
  'macsec',
  'hsr',
  'linux-bridge',
  'ovs-bridge',
  'ovs-interface',
  'vrf',
  'veth',
  'dummy',
  'loopback',
];

/** Sort key for an interface type; unknown types sort last but stay grouped. */
export function typeRank(type: string | undefined): number {
  const index = TYPE_ORDER.indexOf(type ?? '');
  return index < 0 ? TYPE_ORDER.length : index;
}

export function interfaceMeta(type: string | undefined): InterfaceTypeMeta {
  return INTERFACE_TYPES[type ?? ''] ?? { ...UNKNOWN_TYPE, label: type || 'Unknown' };
}

/** Colour used for the administrative state dot. */
export function stateColor(state: string | undefined): string {
  switch (state) {
    case 'up':
      return '#4caf50';
    case 'down':
      return '#f44336';
    case 'absent':
      return '#e91e63';
    case 'ignore':
      return '#9e9e9e';
    default:
      return '#bdbdbd';
  }
}

export interface ProvenanceMeta {
  label: string;
  color: string;
  icon: string;
  description: string;
}

/** How each provenance is announced in the legend and on the node badge. */
export const PROVENANCE: Record<Provenance, ProvenanceMeta> = {
  managed: {
    label: 'Managed',
    color: '#2196f3',
    icon: 'mdi:check-decagram',
    description: 'Declared by a policy that applied successfully on this node',
  },
  failing: {
    label: 'Failing',
    color: '#f44336',
    icon: 'mdi:alert-decagram',
    description: 'Declared by a policy whose enactment is failing on this node',
  },
  observed: {
    label: 'Observed only',
    color: '#9e9e9e',
    icon: 'mdi:eye-outline',
    description: 'Present on the node but claimed by no policy',
  },
  phantom: {
    label: 'Filtered port',
    color: '#616161',
    icon: 'mdi:ghost-outline',
    description:
      'Referenced as a port but absent from the reported state — the handler filters out veth interfaces, which on a busy node is most of them',
  },
};

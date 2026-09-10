/**
 * Type definitions for the nmstate declarative network model.
 *
 * These mirror the `desiredState` / `currentState` schema shared by
 * NodeNetworkConfigurationPolicy (desired) and NodeNetworkState (observed).
 * The schema is large and evolves with nmstate releases, so every interface
 * carries an index signature: unknown fields survive a Form -> YAML -> Form
 * round trip instead of being silently dropped.
 */

/** Administrative state of an interface. */
export type InterfaceState = 'up' | 'down' | 'absent' | 'ignore';

/** Interface types nmstate can report or configure. */
export type InterfaceType =
  | 'ethernet'
  | 'linux-bridge'
  | 'ovs-bridge'
  | 'ovs-interface'
  | 'bond'
  | 'vlan'
  | 'vxlan'
  | 'veth'
  | 'mac-vlan'
  | 'mac-vtap'
  | 'ipvlan'
  | 'vrf'
  | 'infiniband'
  | 'loopback'
  | 'dummy'
  | 'tun'
  | 'macsec'
  | 'hsr'
  | 'unknown';

export interface IpAddress {
  ip: string;
  'prefix-length': number;
  [key: string]: unknown;
}

export interface IpStack {
  enabled?: boolean;
  dhcp?: boolean;
  autoconf?: boolean;
  'auto-dns'?: boolean;
  'auto-routes'?: boolean;
  'auto-gateway'?: boolean;
  address?: IpAddress[];
  [key: string]: unknown;
}

export interface BridgePort {
  name: string;
  'stp-hairpin-mode'?: boolean;
  'stp-path-cost'?: number;
  'stp-priority'?: number;
  vlan?: Record<string, unknown>;
  'link-aggregation'?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface LinkAggregation {
  mode?: string;
  port?: string[];
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

/** A single interface entry of `interfaces[]`. */
export interface NmstateInterface {
  name: string;
  type?: InterfaceType | string;
  state?: InterfaceState | string;
  description?: string;
  mtu?: number;
  'mac-address'?: string;
  /**
   * How nmstate matches this entry to a real device.
   *
   * With `mac-address` or `pci-address`, `name` stops being the kernel name and
   * becomes a label of your choosing, which is how one policy can target the
   * same physical card on nodes that enumerate their NICs differently.
   */
  identifier?: 'name' | 'mac-address' | 'pci-address';
  'pci-address'?: string;
  'profile-name'?: string;
  /** Set by nmstate when this interface is enslaved; reverse of bridge.port[]. */
  controller?: string;
  ipv4?: IpStack;
  ipv6?: IpStack;
  bridge?: { options?: Record<string, unknown>; port?: BridgePort[] };
  'link-aggregation'?: LinkAggregation;
  vlan?: { 'base-iface'?: string; id?: number; protocol?: string; [key: string]: unknown };
  vxlan?: {
    'base-iface'?: string;
    id?: number;
    remote?: string;
    local?: string;
    'destination-port'?: number;
    [key: string]: unknown;
  };
  veth?: { peer?: string; [key: string]: unknown };
  'mac-vlan'?: { 'base-iface'?: string; mode?: string; [key: string]: unknown };
  'mac-vtap'?: { 'base-iface'?: string; mode?: string; [key: string]: unknown };
  ipvlan?: { 'base-iface'?: string; mode?: string; [key: string]: unknown };
  infiniband?: { 'base-iface'?: string; pkey?: string; mode?: string; [key: string]: unknown };
  vrf?: { port?: string[]; 'route-table-id'?: number; [key: string]: unknown };
  ethernet?: Record<string, unknown>;
  ethtool?: Record<string, unknown>;
  lldp?: { enabled?: boolean; neighbors?: unknown[] };
  [key: string]: unknown;
}

export interface NmstateRoute {
  destination?: string;
  'next-hop-address'?: string;
  'next-hop-interface'?: string;
  metric?: number;
  'table-id'?: number;
  state?: 'absent';
  [key: string]: unknown;
}

export interface NmstateDnsConfig {
  search?: string[];
  server?: string[];
  options?: string[];
}

/** The `desiredState` / `currentState` document. */
export interface NmstateState {
  interfaces?: NmstateInterface[];
  routes?: { config?: NmstateRoute[]; running?: NmstateRoute[] };
  'route-rules'?: { config?: Record<string, unknown>[] };
  'dns-resolver'?: { config?: NmstateDnsConfig; running?: NmstateDnsConfig };
  'ovs-db'?: Record<string, unknown>;
  ovn?: Record<string, unknown>;
  hostname?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Condition types reported by NNCP and NNCE. */
export type NmstateConditionType =
  | 'Available'
  | 'Failing'
  | 'Progressing'
  | 'Pending'
  | 'Aborted'
  | 'Degraded'
  | 'Ignored';

export interface NmstateCondition {
  type: NmstateConditionType | string;
  status: 'True' | 'False' | 'Unknown';
  reason?: string;
  message?: string;
  lastHeartbeatTime?: string;
  lastTransitionTime?: string;
}

import { checkIpList, checkMacAddress } from '../../nmstate/validation';

/** Bond modes, as nmstate serialises them. */
export const BOND_MODES = [
  'balance-rr',
  'active-backup',
  'balance-xor',
  'broadcast',
  '802.3ad',
  'balance-tlb',
  'balance-alb',
];

export interface BondModeInfo {
  /** Whether the switch has to treat the members as a single link. */
  needsSwitchConfig: boolean;
  /** What the switch has to be configured for. */
  switchSide: string;
  /** What the mode actually does to traffic. */
  traffic: string;
}

/**
 * What each bond mode expects of the network it plugs into.
 *
 * Choosing a mode is half a decision: the other half is on the switch, and
 * getting the two out of step is the usual way a bond comes up degraded. The
 * modes that hash or round-robin need the switch to treat the ports as one
 * link; the failover and load-balancing modes deliberately do not, which is
 * what makes them usable against switches you do not control.
 */
export const BOND_MODE_INFO: Record<string, BondModeInfo> = {
  'balance-rr': {
    needsSwitchConfig: true,
    switchSide: 'Static LAG — the ports grouped as one link, without LACP.',
    traffic:
      'Sends packets round-robin across members, so a single stream can use the whole aggregate. Packets may arrive out of order.',
  },
  'active-backup': {
    needsSwitchConfig: false,
    switchSide: 'Nothing. Members may even land on different switches.',
    traffic:
      'One member carries everything and the rest sit idle until it fails. Redundancy, no extra throughput.',
  },
  'balance-xor': {
    needsSwitchConfig: true,
    switchSide: 'Static LAG — the ports grouped as one link, without LACP.',
    traffic:
      'Hashes each packet to pick a member, following the transmit hash policy, so a given flow always takes the same one.',
  },
  broadcast: {
    needsSwitchConfig: true,
    switchSide: 'Static LAG — the ports grouped as one link, without LACP.',
    traffic: 'Sends every frame on every member. Pure redundancy, no extra throughput.',
  },
  '802.3ad': {
    needsSwitchConfig: true,
    switchSide:
      'LACP-enabled LAG — EtherChannel with LACP, or an MLAG pair. The switch negotiates the aggregate.',
    traffic:
      'Hashes flows across members once the aggregate is negotiated. Members must agree on speed and duplex.',
  },
  'balance-tlb': {
    needsSwitchConfig: false,
    switchSide: 'Nothing.',
    traffic: 'Spreads outgoing traffic by current load. Everything incoming arrives on one member.',
  },
  'balance-alb': {
    needsSwitchConfig: false,
    switchSide: 'Nothing.',
    traffic:
      'Balances both directions, spreading incoming traffic by answering ARP with different member addresses.',
  },
};

export interface PropertyChoice {
  value: string;
  /** What picking this value actually does. */
  help: string;
}

export interface PropertySpec {
  key: string;
  label: string;
  kind: 'enum' | 'number' | 'string' | 'boolean';
  /** nmstate's own description of the option. */
  help: string;
  choices?: PropertyChoice[];
  min?: number;
  max?: number;
  placeholder?: string;
  /** Modes the option applies to; absent means all of them. */
  modes?: string[];
  /** Modes nmstate refuses the option in. */
  notModes?: string[];
  /** Values offered by the surrounding form, such as the bond's own members. */
  suggestFrom?: 'members';
  validate?: (value: string) => string | null;
}

const LACP = '802.3ad';

/**
 * Every bond option nmstate models, with what it does and where it applies.
 *
 * Descriptions come from nmstate's own field documentation; the per-value
 * explanations come from the kernel bonding documentation nmstate points to,
 * since nmstate's own text stops at "the possible values and their effects
 * are:" without listing them.
 *
 * Mode restrictions are the ones nmstate enforces by rejecting the policy, plus
 * the ones its documentation states an option has no effect outside of. Offering
 * an option the mode ignores is a quieter kind of wrong than offering one that
 * fails, but it is still wrong.
 */
export const BOND_OPTIONS: PropertySpec[] = [
  {
    key: 'xmit_hash_policy',
    label: 'Transmit hash policy',
    kind: 'enum',
    help: 'Selects the transmit hash policy used to pick a member for each packet.',
    modes: ['balance-xor', LACP, 'balance-tlb'],
    choices: [
      {
        value: 'layer2',
        help: 'Hashes the MAC addresses only. All traffic to a given peer takes one member — simple, but a single peer never spreads.',
      },
      {
        value: 'layer2+3',
        help: 'Hashes MAC and IP addresses. Traffic through a router spreads across peers behind it, unlike layer2.',
      },
      {
        value: 'layer3+4',
        help: 'Hashes IP addresses and ports, so separate connections between the same pair spread. Fragmented traffic may reorder, and it is not strictly 802.3ad compliant.',
      },
      {
        value: 'encap2+3',
        help: 'Like layer2+3 but hashes the inner headers of encapsulated traffic, so tunnelled flows spread instead of hashing to one member.',
      },
      {
        value: 'encap3+4',
        help: 'Like layer3+4 on the inner headers of encapsulated traffic.',
      },
      {
        value: 'vlan+srcmac',
        help: 'Hashes the VLAN ID with the source MAC, for traffic separated by VLAN rather than by peer.',
      },
    ],
  },
  {
    key: 'lacp_rate',
    label: 'LACP rate',
    kind: 'enum',
    help: 'How often to ask the link partner to transmit LACPDU packets.',
    modes: [LACP],
    choices: [
      { value: 'slow', help: 'Every 30 seconds. The default, and easier on the switch.' },
      { value: 'fast', help: 'Every second, so a failure is noticed sooner.' },
    ],
  },
  {
    key: 'lacp_active',
    label: 'LACP active',
    kind: 'boolean',
    help: 'Whether to send LACPDU frames periodically.',
    modes: [LACP],
  },
  {
    key: 'ad_select',
    label: 'Aggregation selection',
    kind: 'enum',
    help: 'The 802.3ad aggregation selection logic to use.',
    modes: [LACP],
    choices: [
      {
        value: 'stable',
        help: 'Keeps the active aggregator until it loses all its ports. Avoids churn.',
      },
      {
        value: 'bandwidth',
        help: 'Prefers the aggregator with the most bandwidth, reselecting when links change.',
      },
      { value: 'count', help: 'Prefers the aggregator with the most ports.' },
    ],
  },
  {
    key: 'min_links',
    label: 'Minimum links',
    kind: 'number',
    min: 0,
    help: 'Members that must be up before the bond asserts carrier, like Cisco EtherChannel min-links.',
    modes: [LACP],
  },
  {
    key: 'ad_actor_sys_prio',
    label: 'AD actor system priority',
    kind: 'number',
    min: 1,
    max: 65535,
    help: 'This system’s priority in the aggregation. Allowed range is 1 to 65535.',
    modes: [LACP],
  },
  {
    key: 'ad_actor_system',
    label: 'AD actor system MAC',
    kind: 'string',
    placeholder: '00:11:22:33:44:55',
    help: 'MAC used for this system in LACPDU exchanges. It may be neither empty nor multicast.',
    modes: [LACP],
    validate: value => (checkMacAddress(value).valid ? null : checkMacAddress(value).message ?? ''),
  },
  {
    key: 'ad_user_port_key',
    label: 'AD user port key',
    kind: 'number',
    min: 0,
    max: 1023,
    help: 'The user-defined upper bits of the port key. Range 0 to 1023.',
    modes: [LACP],
  },
  {
    key: 'primary',
    label: 'Primary member',
    kind: 'string',
    suggestFrom: 'members',
    help: 'The member that stays active whenever it is available; others are used only while it is down.',
    modes: ['active-backup', 'balance-tlb', 'balance-alb'],
  },
  {
    key: 'primary_reselect',
    label: 'Primary reselect',
    kind: 'enum',
    help: 'When the primary takes back over, designed to stop it flip-flopping with another member.',
    modes: ['active-backup', 'balance-tlb', 'balance-alb'],
    choices: [
      { value: 'always', help: 'The primary becomes active as soon as it comes back up.' },
      { value: 'better', help: 'Only when the primary is faster than the current member.' },
      { value: 'failure', help: 'Only when the current active member fails.' },
    ],
  },
  {
    key: 'fail_over_mac',
    label: 'Fail-over MAC',
    kind: 'enum',
    help: 'How the bond handles its MAC address across a failover.',
    modes: ['active-backup'],
    choices: [
      { value: 'none', help: 'All members take the bond’s MAC. The traditional behaviour.' },
      {
        value: 'active',
        help: 'The bond takes the MAC of the active member, changing on failover. Needed for hardware that cannot change its MAC.',
      },
      {
        value: 'follow',
        help: 'The bond keeps the first member’s MAC and moves it to whichever member becomes active.',
      },
    ],
  },
  {
    key: 'miimon',
    label: 'MII monitor interval (ms)',
    kind: 'number',
    min: 0,
    help: 'How often the link state of each member is inspected. 100 is a good starting point; zero disables it.',
  },
  {
    key: 'updelay',
    label: 'Up delay (ms)',
    kind: 'number',
    min: 0,
    help: 'Wait before enabling a member after link recovery. Only used with miimon, and should be a multiple of it.',
  },
  {
    key: 'downdelay',
    label: 'Down delay (ms)',
    kind: 'number',
    min: 0,
    help: 'Wait before disabling a member after link failure. Only used with miimon, and should be a multiple of it.',
  },
  {
    key: 'use_carrier',
    label: 'Use carrier',
    kind: 'boolean',
    help: 'Whether miimon reads netif_carrier_ok rather than the older, less efficient MII and ETHTOOL ioctls.',
  },
  {
    key: 'arp_interval',
    label: 'ARP interval (ms)',
    kind: 'number',
    min: 0,
    help: 'How often to probe the ARP targets. Cannot be combined with miimon.',
    notModes: [LACP, 'balance-tlb', 'balance-alb'],
  },
  {
    key: 'arp_ip_target',
    label: 'ARP IP targets',
    kind: 'string',
    placeholder: '192.168.0.1,192.168.0.2',
    help: 'IPv4 peers to probe while the ARP interval is greater than zero.',
    notModes: [LACP, 'balance-tlb', 'balance-alb'],
    validate: value => checkIpList(value).message ?? null,
  },
  {
    key: 'arp_validate',
    label: 'ARP validate',
    kind: 'enum',
    help: 'Whether ARP probes and replies are validated, and whether other traffic counts as proof of life.',
    notModes: [LACP, 'balance-tlb', 'balance-alb'],
    choices: [
      { value: 'none', help: 'No validation; any traffic counts as the link being up.' },
      { value: 'active', help: 'Validate on the active member only.' },
      { value: 'backup', help: 'Validate on backup members only.' },
      { value: 'all', help: 'Validate on every member.' },
      { value: 'filter', help: 'Only ARP traffic counts as proof of life, on every member.' },
      { value: 'filter-active', help: 'Filter everywhere, and validate on the active member.' },
      { value: 'filter-backup', help: 'Filter everywhere, and validate on backup members.' },
    ],
  },
  {
    key: 'arp_all_targets',
    label: 'ARP all targets',
    kind: 'enum',
    help: 'How many ARP targets must answer for a member to count as up. Affects active-backup with ARP validation.',
    notModes: [LACP, 'balance-tlb', 'balance-alb'],
    choices: [
      { value: 'any', help: 'One reachable target is enough.' },
      { value: 'all', help: 'Every target must be reachable.' },
    ],
  },
  {
    key: 'all_slaves_active',
    label: 'Duplicate frames',
    kind: 'enum',
    help: 'What to do with duplicate frames received on inactive members.',
    choices: [
      { value: 'dropped', help: 'Drop them, which is what most setups want.' },
      { value: 'delivered', help: 'Deliver them, for the rare case that wants every copy.' },
    ],
  },
  {
    key: 'resend_igmp',
    label: 'Resend IGMP',
    kind: 'number',
    min: 0,
    max: 255,
    help: 'IGMP membership reports issued after a failover, one immediately and the rest every 200ms. Range 0 to 255.',
  },
  {
    key: 'num_grat_arp',
    label: 'Gratuitous ARPs',
    kind: 'number',
    min: 0,
    max: 255,
    help: 'Peer notifications issued after a failover.',
  },
  {
    key: 'num_unsol_na',
    label: 'Unsolicited NAs',
    kind: 'number',
    min: 0,
    max: 255,
    help: 'IPv6 neighbour advertisements issued after a failover.',
  },
  {
    key: 'packets_per_slave',
    label: 'Packets per member',
    kind: 'number',
    min: 0,
    max: 65535,
    help: 'Packets sent through one member before moving to the next; zero picks a member at random.',
    modes: ['balance-rr'],
  },
  {
    key: 'lp_interval',
    label: 'Learning packet interval (s)',
    kind: 'number',
    min: 1,
    help: 'Seconds between learning packets sent to each member’s peer switch.',
    modes: ['balance-tlb', 'balance-alb'],
  },
  {
    key: 'tlb_dynamic_lb',
    label: 'Dynamic load balancing',
    kind: 'boolean',
    help: 'Whether active flows are reshuffled across members by load each interval.',
    modes: ['balance-tlb'],
  },
];

/** The options nmstate will accept for a given bond mode. */
export function optionsForMode(mode: string): PropertySpec[] {
  return BOND_OPTIONS.filter(
    spec => (!spec.modes || spec.modes.includes(mode)) && !spec.notModes?.includes(mode)
  );
}

/**
 * Why an option cannot be set right now, beyond mode restrictions.
 *
 * nmstate refuses a bond that sets both miimon and arp_interval above zero,
 * which is worth saying before the policy is sent rather than after.
 */
export function conflictFor(key: string, options: Record<string, unknown>): string | null {
  const above = (name: string) => Number(options[name] ?? 0) > 0;
  if (key === 'miimon' && above('arp_interval')) {
    return 'nmstate rejects a bond that sets both miimon and an ARP interval';
  }
  if (key === 'arp_interval' && above('miimon')) {
    return 'nmstate rejects a bond that sets both miimon and an ARP interval';
  }
  return null;
}

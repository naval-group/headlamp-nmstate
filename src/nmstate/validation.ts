/**
 * Format checks for the identifiers a policy can carry.
 *
 * These values end up in a document applied to every matching node, so a
 * malformed one is worth catching in the form rather than discovering it in a
 * failed enactment. Each rule follows what the kernel or nmstate actually
 * accepts, not a guess.
 */

/** Six colon-separated hex pairs, as nmstate writes them. */
const MAC_PATTERN = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

/**
 * Domain, bus, device and function: `0000:00:1f.6`.
 *
 * Matches the addresses nmstate's own test fixtures use — four hex digits for
 * the domain, two each for bus and device, and a single-digit function.
 */
const PCI_PATTERN = /^[0-9A-Fa-f]{4}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}\.[0-7]$/;

/**
 * The kernel stores an interface name in IFNAMSIZ bytes, one of which is the
 * terminator, leaving fifteen characters. It also refuses names containing a
 * slash or whitespace, and the two names that would collide with directory
 * entries.
 */
export const MAX_INTERFACE_NAME = 15;
const INTERFACE_NAME_PATTERN = /^[^\s/]+$/;

export interface FieldCheck {
  valid: boolean;
  /** Why it was rejected, phrased for someone filling in the form. */
  message?: string;
}

const OK: FieldCheck = { valid: true };

export function checkMacAddress(value: string): FieldCheck {
  if (!value.trim()) return { valid: false, message: 'A MAC address is required' };
  if (!MAC_PATTERN.test(value.trim())) {
    return { valid: false, message: 'Six colon-separated hex pairs, e.g. B0:7B:25:0D:51:4E' };
  }
  return OK;
}

export function checkPciAddress(value: string): FieldCheck {
  if (!value.trim()) return { valid: false, message: 'A PCI address is required' };
  if (!PCI_PATTERN.test(value.trim())) {
    return { valid: false, message: 'Domain, bus, device and function, e.g. 0000:00:1f.6' };
  }
  return OK;
}

export function checkInterfaceName(value: string): FieldCheck {
  const name = value.trim();
  if (!name) return { valid: false, message: 'Interface name is required' };
  if (name.length > MAX_INTERFACE_NAME) {
    return { valid: false, message: `At most ${MAX_INTERFACE_NAME} characters` };
  }
  if (name === '.' || name === '..') {
    return { valid: false, message: 'The kernel reserves this name' };
  }
  if (!INTERFACE_NAME_PATTERN.test(name)) {
    return { valid: false, message: 'No spaces or slashes' };
  }
  return OK;
}

/** Well-known routing tables, offered before falling back to free text. */
export const ROUTE_TABLES = [
  { id: 254, label: '254 — main', help: 'Where routes go unless told otherwise.' },
  { id: 253, label: '253 — default', help: 'Consulted last, after main.' },
  { id: 255, label: '255 — local', help: 'Kernel-maintained local and broadcast routes.' },
];

/**
 * Dotted-quad IPv4, each octet 0-255.
 *
 * Written out rather than `\d{1,3}` so that 999.1.1.1 is rejected here instead
 * of at apply time on the node.
 */
const IPV4_OCTET = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_PATTERN = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);

/**
 * IPv6, including the `::` compressed form and IPv4-mapped tails.
 *
 * Assembled from parts because a single literal for this is unreadable and
 * unreviewable.
 */
const H16 = '[0-9A-Fa-f]{1,4}';
const IPV6_PATTERN = new RegExp(
  '^(' +
    `(${H16}:){7}${H16}|` +
    `(${H16}:){1,7}:|` +
    `(${H16}:){1,6}:${H16}|` +
    `(${H16}:){1,5}(:${H16}){1,2}|` +
    `(${H16}:){1,4}(:${H16}){1,3}|` +
    `(${H16}:){1,3}(:${H16}){1,4}|` +
    `(${H16}:){1,2}(:${H16}){1,5}|` +
    `${H16}:((:${H16}){1,6})|` +
    `:((:${H16}){1,7}|:)|` +
    `fe80:(:${H16}){0,4}%[0-9a-zA-Z]+|` +
    `::(ffff(:0{1,4})?:)?((${IPV4_OCTET}\\.){3}${IPV4_OCTET})|` +
    `(${H16}:){1,4}:((${IPV4_OCTET}\\.){3}${IPV4_OCTET})` +
    ')$'
);

export function isIpv4(value: string): boolean {
  return IPV4_PATTERN.test(value.trim());
}

export function isIpv6(value: string): boolean {
  return IPV6_PATTERN.test(value.trim());
}

export function checkIpAddress(value: string, family?: 'ipv4' | 'ipv6'): FieldCheck {
  const ip = value.trim();
  if (!ip) return { valid: false, message: 'An address is required' };
  if (family === 'ipv4' && !isIpv4(ip))
    return { valid: false, message: 'Not a valid IPv4 address' };
  if (family === 'ipv6' && !isIpv6(ip))
    return { valid: false, message: 'Not a valid IPv6 address' };
  if (!family && !isIpv4(ip) && !isIpv6(ip)) {
    return { valid: false, message: 'Not a valid IP address' };
  }
  return OK;
}

/** Longest prefix each family allows. */
const MAX_PREFIX = { ipv4: 32, ipv6: 128 } as const;

/**
 * An address with its prefix, as the form takes them: `192.168.0.10/24`.
 *
 * A missing prefix is rejected rather than defaulted. Silently choosing /24
 * turns a typo into a working-looking policy that puts the node on the wrong
 * subnet.
 */
export function checkIpWithPrefix(value: string, family: 'ipv4' | 'ipv6'): FieldCheck {
  const text = value.trim();
  if (!text) return { valid: false, message: 'An address is required' };

  const slash = text.indexOf('/');
  if (slash === -1) {
    return {
      valid: false,
      message: `Include the prefix, e.g. ${family === 'ipv4' ? '192.168.0.10/24' : 'fd00::10/64'}`,
    };
  }

  const address = checkIpAddress(text.slice(0, slash), family);
  if (!address.valid) return address;

  const prefix = text.slice(slash + 1);
  if (!/^\d+$/.test(prefix)) return { valid: false, message: 'The prefix must be a number' };
  const length = Number(prefix);
  if (length > MAX_PREFIX[family]) {
    return { valid: false, message: `The prefix cannot exceed /${MAX_PREFIX[family]}` };
  }
  return OK;
}

/** A route destination: a network with its prefix, or a default route. */
export function checkDestination(value: string): FieldCheck {
  const text = value.trim();
  if (!text) return { valid: false, message: 'A destination is required' };
  if (text === '0.0.0.0/0' || text === '::/0') return OK;
  const family = text.includes(':') ? 'ipv6' : 'ipv4';
  return checkIpWithPrefix(text, family);
}

/** Comma-separated IPv4 addresses, as bond ARP targets are written. */
export function checkIpList(value: string): FieldCheck {
  const entries = value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  if (entries.length === 0) return { valid: false, message: 'At least one address is required' };
  const bad = entries.find(entry => !isIpv4(entry) && !isIpv6(entry));
  return bad ? { valid: false, message: `${bad} is not a valid IP address` } : OK;
}

/**
 * `maxUnavailable`: a count of nodes or a percentage of them.
 *
 * nmstate accepts either, and the CRD types the field as both, so the form has
 * to as well.
 */
export function checkMaxUnavailable(value: string): FieldCheck {
  const text = value.trim();
  if (!text) return OK;
  if (/^\d+$/.test(text)) return OK;
  if (/^\d+%$/.test(text)) {
    return Number(text.slice(0, -1)) <= 100 ? OK : { valid: false, message: 'At most 100%' };
  }
  return { valid: false, message: 'A number of nodes, or a percentage such as 50%' };
}

/**
 * A capture name, which is referenced from the desired state as
 * `{{ capture.<name>.… }}`.
 *
 * The reference is parsed on dots, so a name containing one silently changes
 * which capture is being addressed; whitespace breaks the template outright.
 */
export function checkCaptureName(value: string): FieldCheck {
  const name = value.trim();
  if (!name) return { valid: false, message: 'A name is required' };
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    return { valid: false, message: 'Letters, digits, hyphen and underscore only' };
  }
  return OK;
}

/** Bounds nmstate and the kernel place on the numeric fields the form offers. */
export const NUMERIC_BOUNDS = {
  'vlan-id': { min: 1, max: 4094, label: 'VLAN ID' },
  vni: { min: 0, max: 16777215, label: 'VNI' },
  port: { min: 1, max: 65535, label: 'UDP port' },
  mtu: { min: 68, max: 65535, label: 'MTU' },
  metric: { min: 0, max: 4294967295, label: 'Metric' },
  'route-table': { min: 0, max: 4294967295, label: 'Route table' },
} as const;

export type NumericField = keyof typeof NUMERIC_BOUNDS;

export function checkNumber(value: number | undefined, field: NumericField): FieldCheck {
  if (value === undefined) return OK;
  const { min, max, label } = NUMERIC_BOUNDS[field];
  if (!Number.isFinite(value)) return { valid: false, message: `${label} must be a number` };
  if (value < min || value > max) {
    return { valid: false, message: `${label} must be between ${min} and ${max}` };
  }
  return OK;
}

/**
 * Reads a number out of a text input.
 *
 * Empty means "not set", not zero. `Number('')` is 0, so clearing a VLAN ID
 * used to write `id: 0` — a value nmstate rejects — and a paste that is not a
 * number yielded NaN, which JSON serialises as null.
 */
export function parseOptionalNumber(raw: string): number | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const value = Number(text);
  return Number.isFinite(value) ? value : undefined;
}

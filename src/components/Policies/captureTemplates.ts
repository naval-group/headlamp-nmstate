/**
 * Ready-made capture expressions.
 *
 * NMPolicy's expression language is small but undocumented in the CRD, so the
 * form offers working starting points rather than an empty box. It has three
 * operators: `==` filters a state path, `:=` replaces a value, and `|` pipes a
 * capture into a further operation.
 */
export interface CaptureTemplate {
  /** Suggested capture name. */
  name: string;
  label: string;
  expression: string;
  description: string;
  /** How the captured value is typically referenced from the desired state. */
  reference?: string;
}

export const CAPTURE_TEMPLATES: CaptureTemplate[] = [
  {
    name: 'default-gw',
    label: 'The default route',
    expression: 'routes.running.destination=="0.0.0.0/0"',
    description: 'Captures the route the node uses to leave its subnet.',
    reference: '{{ capture.default-gw.routes.running.0.next-hop-address }}',
  },
  {
    name: 'base-iface',
    label: 'The interface carrying the default route',
    expression: 'interfaces.name==capture.default-gw.routes.running.0.next-hop-interface',
    description:
      'Builds on the default-gw capture to find the primary NIC, whatever it is called on each node.',
    reference: '{{ capture.base-iface.interfaces.0.name }}',
  },
  {
    name: 'iface-by-mac',
    label: 'An interface by MAC address',
    expression: 'interfaces.mac-address=="AA:BB:CC:DD:EE:FF"',
    description:
      'Selects a NIC by hardware address, for when the kernel name differs between otherwise identical nodes.',
    reference: '{{ capture.iface-by-mac.interfaces.0.name }}',
  },
  {
    name: 'iface-by-name',
    label: 'An interface by name',
    expression: 'interfaces.name=="eth0"',
    description: 'Selects one named interface.',
    reference: '{{ capture.iface-by-name.interfaces.0.mac-address }}',
  },
  {
    name: 'ethernets',
    label: 'Every ethernet interface',
    expression: 'interfaces.type=="ethernet"',
    description: 'Selects all physical NICs on the node.',
    reference: '{{ capture.ethernets.interfaces.0.name }}',
  },
  {
    name: 'iface-routes',
    label: 'Routes going through an interface',
    expression: 'routes.running.next-hop-interface=="eth0"',
    description: 'Selects the routes currently leaving through a given interface.',
  },
  {
    name: 'routes-moved',
    label: 'Move captured routes to another interface',
    expression: 'capture.iface-routes | routes.running.next-hop-interface:="br1"',
    description:
      'Pipes an earlier capture through a replacement, the usual way to carry routes over to a new bridge.',
    reference: '{{ capture.routes-moved.routes.running }}',
  },
  {
    name: 'routes-removed',
    label: 'Mark captured routes for removal',
    expression: 'capture.iface-routes | routes.running.state:="absent"',
    description: 'Pipes an earlier capture through a replacement that deletes those routes.',
    reference: '{{ capture.routes-removed.routes.running }}',
  },
];

/**
 * The expression a capture is typically referenced by.
 *
 * A capture does not always yield an interface: it returns whatever the state
 * path it filters on selects, so a capture over `routes.running` gives routes
 * back. The hint follows the expression's own root rather than assuming.
 */
export function captureReference(name: string, expression: string): string {
  const root = expression.trim().split(/[.=|\s]/)[0];
  if (root === 'routes') return `{{ capture.${name}.routes.running.0.next-hop-interface }}`;
  if (root === 'route-rules') return `{{ capture.${name}.route-rules.config.0.route-table }}`;
  if (root === 'dns-resolver') return `{{ capture.${name}.dns-resolver.config.server.0 }}`;
  if (root === 'capture') {
    // A piped capture keeps the shape of whatever it was piped from.
    const piped = expression.split('|')[1] ?? '';
    const pipedRoot = piped.trim().split(/[.=:\s]/)[0];
    if (pipedRoot === 'routes') return `{{ capture.${name}.routes.running }}`;
    return `{{ capture.${name}.interfaces.0.name }}`;
  }
  return `{{ capture.${name}.interfaces.0.name }}`;
}

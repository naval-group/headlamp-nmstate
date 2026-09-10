import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/interfaces.json';
import { buildTopology } from './topology';
import { NmstateInterface } from './types';

const worker = fixtures['worker-a'] as NmstateInterface[];
const control = fixtures['control-a'] as NmstateInterface[];

describe('buildTopology', () => {
  it('keeps every reported interface as a node', () => {
    const topo = buildTopology(worker);
    for (const iface of worker) {
      expect(topo.nodes.find(n => n.id === iface.name)).toBeDefined();
    }
  });

  it('materialises bridge ports that the handler filtered out of the state', () => {
    // worker-a reports 12 interfaces but its bridges reference 12 ports, 10 of
    // which are veths the handler drops. They must still appear, or the graph
    // silently loses most of its edges.
    const topo = buildTopology(worker);
    expect(topo.phantomCount).toBe(10);
    expect(topo.nodes.find(n => n.id === 'vethe59c9473')?.provenance).toBe('phantom');
  });

  it('links bridge ports upward to their bridge', () => {
    const topo = buildTopology(worker);
    const edge = topo.edges.find(e => e.id === 'eth0->br0');
    expect(edge).toMatchObject({ source: 'eth0', target: 'br0', kind: 'bridge-port' });
  });

  it('puts the uplink above its bridge and the pod ends below', () => {
    // The diagram is oriented by role: physical network at the top, pods at the
    // bottom, so a stack reads the way traffic flows through it.
    const topo = buildTopology(worker);
    const nic = topo.nodes.find(n => n.id === 'eth0');
    const bridge = topo.nodes.find(n => n.id === 'br0');
    const podEnd = topo.nodes.find(n => n.id === 'vethe59c9473');
    expect(nic!.rank).toBeLessThan(bridge!.rank);
    expect(podEnd!.rank).toBeGreaterThan(bridge!.rank);
  });

  it('puts an overlay uplink above its bridge, not beside the pod ends', () => {
    // overlay-vxlan0 and the veths are all ports of overlay-br0, but the vxlan is
    // the way out of the node and the veths are the way in.
    const topo = buildTopology(worker);
    const bridge = topo.nodes.find(n => n.id === 'overlay-br0');
    const uplink = topo.nodes.find(n => n.id === 'overlay-vxlan0');
    const podEnd = topo.nodes.find(n => n.id === 'veth895fc1ed');
    expect(uplink!.rank).toBeLessThan(bridge!.rank);
    expect(podEnd!.rank).toBeGreaterThan(bridge!.rank);
    expect(uplink!.rank).not.toBe(podEnd!.rank);
  });

  it('uses the controller field as a second source for enslavement', () => {
    // control-a reports veths carrying `controller: overlay-br0` while the
    // bridge's own port list does not mention them.
    const topo = buildTopology(control);
    expect(topo.edges.find(e => e.id === 'veth29df9268->overlay-br0')).toBeDefined();
  });

  it('never places two connected interfaces on the same row', () => {
    for (const ifaces of [worker, control]) {
      const topo = buildTopology(ifaces);
      const rank = new Map(topo.nodes.map(n => [n.id, n.rank]));
      for (const e of topo.edges) {
        expect(rank.get(e.source)).not.toBe(rank.get(e.target));
      }
    }
  });

  it('stacks a VLAN on a VLAN downward from the physical NIC', () => {
    const qinq: NmstateInterface[] = [
      { name: 'eth0', type: 'ethernet', state: 'up' },
      { name: 'bond0', type: 'bond', state: 'up', 'link-aggregation': { port: ['eth0'] } },
      { name: 'vlan10', type: 'vlan', state: 'up', vlan: { 'base-iface': 'bond0', id: 10 } },
      { name: 'vlan20', type: 'vlan', state: 'up', vlan: { 'base-iface': 'vlan10', id: 20 } },
    ];
    const topo = buildTopology(qinq);
    const rank = Object.fromEntries(topo.nodes.map(n => [n.id, n.rank]));
    expect(rank).toEqual({ eth0: 0, bond0: 1, vlan10: 2, vlan20: 3 });
  });

  it('carries enactment provenance onto the matching nodes', () => {
    const topo = buildTopology(worker, name =>
      name === 'br0'
        ? { provenance: 'failing', policy: 'br0-policy', failureMessage: 'rollback' }
        : { provenance: 'observed' }
    );
    const bridge = topo.nodes.find(n => n.id === 'br0');
    expect(bridge?.provenance).toBe('failing');
    expect(bridge?.failureMessage).toBe('rollback');
  });

  it('does not hang on a cyclic desiredState', () => {
    const cyclic: NmstateInterface[] = [
      { name: 'a', type: 'vlan', vlan: { 'base-iface': 'b' } },
      { name: 'b', type: 'vlan', vlan: { 'base-iface': 'a' } },
    ];
    expect(() => buildTopology(cyclic)).not.toThrow();
  });

  it('produces a deterministic ordering', () => {
    const a = buildTopology(worker).nodes.map(n => `${n.rank}:${n.order}:${n.id}`);
    const b = buildTopology(worker).nodes.map(n => `${n.rank}:${n.order}:${n.id}`);
    expect(a).toEqual(b);
  });
});

describe('clustering', () => {
  it('puts each connected stack in its own component', () => {
    const topo = buildTopology(worker);
    const clusterOf = (id: string) => topo.nodes.find(n => n.id === id)?.cluster;
    // br0 and overlay-br0 share no interface, so they must not share a frame.
    expect(clusterOf('br0')).not.toBe(clusterOf('overlay-br0'));
    // A bridge and its own port belong together.
    expect(clusterOf('eth0')).toBe(clusterOf('br0'));
    expect(clusterOf('overlay-vxlan0')).toBe(clusterOf('overlay-br0'));
  });

  it('never spans a component across an edge boundary', () => {
    for (const ifaces of [worker, control]) {
      const topo = buildTopology(ifaces);
      const clusterOf = new Map(topo.nodes.map(n => [n.id, n.cluster]));
      for (const e of topo.edges) {
        expect(clusterOf.get(e.source)).toBe(clusterOf.get(e.target));
      }
    }
  });

  it('marks an interface with no edges as isolated and alone in its component', () => {
    const topo = buildTopology(worker);
    const spare = topo.nodes.find(n => n.id === 'spare-br1');
    expect(spare?.isolated).toBe(true);
    expect(topo.clusters[spare!.cluster].nodes).toEqual(['spare-br1']);
    expect(topo.nodes.find(n => n.id === 'br0')?.isolated).toBe(false);
  });

  it('orders components largest first', () => {
    const topo = buildTopology(worker);
    const sizes = topo.clusters.map(c => c.nodes.length);
    expect(sizes).toEqual([...sizes].sort((a, b) => b - a));
  });

  it('titles a component after its most structural interface', () => {
    const topo = buildTopology(worker);
    const br01Cluster = topo.clusters[topo.nodes.find(n => n.id === 'br0')!.cluster];
    expect(br01Cluster.label).toBe('br0');
  });
});

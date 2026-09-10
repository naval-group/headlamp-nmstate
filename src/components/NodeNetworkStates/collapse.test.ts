import { describe, expect, it } from 'vitest';
import fixtures from '../../nmstate/__fixtures__/interfaces.json';
import { buildTopology } from '../../nmstate/topology';
import { NmstateInterface } from '../../nmstate/types';
import { collapsePodPorts, GROUP_PREFIX } from './collapse';

const worker = fixtures['worker-a'] as NmstateInterface[];

describe('collapsePodPorts', () => {
  const topology = buildTopology(worker);
  const visible = new Set(topology.nodes.map(n => n.id));

  it('folds a bridge with many pod ports into one summary node', () => {
    // overlay-br0 carries six filtered veths; drawn individually they say
    // nothing beyond their count while stretching the diagram.
    const collapsed = collapsePodPorts(topology, visible, new Set());
    const summary = collapsed.nodes.find(n => n.id === `${GROUP_PREFIX}overlay-br0`);
    expect(summary?.collapsed).toBe(6);
    expect(summary?.name).toBe('6 pod ports');
    expect(collapsed.nodes.find(n => n.id === 'veth895fc1ed')).toBeUndefined();
    expect(collapsed.nodes.length).toBeLessThan(topology.nodes.length);
  });

  it('keeps the summary node wired to its controller', () => {
    const collapsed = collapsePodPorts(topology, visible, new Set());
    const edge = collapsed.edges.find(e => e.source === `${GROUP_PREFIX}overlay-br0`);
    expect(edge?.target).toBe('overlay-br0');
  });

  it('leaves the uplink alone', () => {
    // An uplink is never interchangeable with the pod-facing ports.
    const collapsed = collapsePodPorts(topology, visible, new Set());
    expect(collapsed.nodes.find(n => n.id === 'overlay-vxlan0')).toBeDefined();
    expect(collapsed.nodes.find(n => n.id === 'eth0')).toBeDefined();
  });

  it('puts the ports back when the controller is expanded', () => {
    const collapsed = collapsePodPorts(topology, visible, new Set(['overlay-br0']));
    expect(collapsed.nodes.find(n => n.id === 'veth895fc1ed')).toBeDefined();
    expect(collapsed.folded.has('overlay-br0')).toBe(false);
  });

  it('leaves a controller below the threshold untouched', () => {
    // provision-br1 has a single veth: folding one port would only add a hop.
    const collapsed = collapsePodPorts(topology, visible, new Set());
    expect(collapsed.folded.has('provision-br1')).toBe(false);
    expect(collapsed.nodes.find(n => n.id === 'veth4f6ffc37')).toBeDefined();
  });
});

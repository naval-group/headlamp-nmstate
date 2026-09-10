import { describe, expect, it } from 'vitest';
import { combinedImpact, deletionImpact } from './deletion';

describe('deletionImpact', () => {
  it('treats a configured interface as left behind', () => {
    const impact = deletionImpact({
      interfaces: [{ name: 'br0', type: 'linux-bridge', state: 'up' }],
    });
    expect(impact.clean).toBe(false);
    expect(impact.lingering).toEqual(['br0']);
  });

  it('treats a missing state as up, which is what nmstate defaults to', () => {
    const impact = deletionImpact({ interfaces: [{ name: 'br0', type: 'linux-bridge' }] });
    expect(impact.lingering).toEqual(['br0']);
    expect(impact.clean).toBe(false);
  });

  it('counts a down interface as left behind, since it stays configured', () => {
    const impact = deletionImpact({
      interfaces: [{ name: 'br0', type: 'linux-bridge', state: 'down' }],
    });
    expect(impact.lingering).toEqual(['br0']);
  });

  it('is clean when every interface is being removed', () => {
    const impact = deletionImpact({
      interfaces: [
        { name: 'br0', type: 'linux-bridge', state: 'absent' },
        { name: 'eth0', type: 'ethernet', state: 'absent' },
      ],
    });
    expect(impact.clean).toBe(true);
    expect(impact.removing).toEqual(['br0', 'eth0']);
    expect(impact.lingering).toEqual([]);
  });

  it('does not count an ignored interface either way', () => {
    // `ignore` means the policy never configured it, so its removal leaves
    // nothing behind.
    const impact = deletionImpact({
      interfaces: [{ name: 'tailscale0', type: 'tun', state: 'ignore' }],
    });
    expect(impact.clean).toBe(true);
    expect(impact.ignored).toEqual(['tailscale0']);
    expect(impact.lingering).toEqual([]);
  });

  it('reports the mix when a policy both removes and configures', () => {
    const impact = deletionImpact({
      interfaces: [
        { name: 'old-br', type: 'linux-bridge', state: 'absent' },
        { name: 'new-br', type: 'linux-bridge', state: 'up' },
      ],
    });
    expect(impact.clean).toBe(false);
    expect(impact.removing).toEqual(['old-br']);
    expect(impact.lingering).toEqual(['new-br']);
  });

  it('is clean for a policy that declares nothing', () => {
    expect(deletionImpact(undefined).clean).toBe(true);
    expect(deletionImpact({ interfaces: [] }).clean).toBe(true);
  });
});

describe('combinedImpact', () => {
  it('is dirty when any policy leaves something behind', () => {
    const impact = combinedImpact([
      { interfaces: [{ name: 'a', state: 'absent' }] },
      { interfaces: [{ name: 'b', state: 'up' }] },
    ]);
    expect(impact.clean).toBe(false);
    expect(impact.lingering).toEqual(['b']);
    expect(impact.removing).toEqual(['a']);
  });

  it('lists each interface once across policies', () => {
    const impact = combinedImpact([
      { interfaces: [{ name: 'br0', state: 'up' }] },
      { interfaces: [{ name: 'br0', state: 'up' }] },
    ]);
    expect(impact.lingering).toEqual(['br0']);
  });
});

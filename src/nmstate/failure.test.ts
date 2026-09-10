import { describe, expect, it } from 'vitest';
import { parseFailure, retriesFor } from './failure';

/** A real failure from the cluster, trimmed to keep the shape. */
const REAL = `error reconciling NodeNetworkConfigurationPolicy on node workload-1 at desired state apply: "",
 , [2026-09-09T21:36:25Z INFO  nmstatectl] Nmstate version: 2.2.54
[2026-09-09T21:36:25Z INFO  nmstate::ifaces::inter_ifaces] Ignoring interface cilium_wg0 type wireguard
[2026-09-09T21:36:25Z INFO  nmstate::ifaces::inter_ifaces] Ignoring interface lxcb21824385467 type ethernet
[2026-09-09T21:36:25Z INFO  nmstate::ifaces::inter_ifaces] Ignoring interface veth5d682e1a type ethernet
NmstateError: InvalidArgument: Ethernet interface bad1 does not exists
: failed to execute nmstatectl apply --no-commit --timeout 480: exit status 1`;

describe('parseFailure', () => {
  it('lifts the error out of the apply log', () => {
    const failure = parseFailure(REAL);
    expect(failure.recognised).toBe(true);
    expect(failure.summary).toBe('InvalidArgument: Ethernet interface bad1 does not exists');
  });

  it('keeps the whole log available', () => {
    const failure = parseFailure(REAL);
    expect(failure.detail).toContain('Ignoring interface veth5d682e1a');
    expect(failure.detail.length).toBeGreaterThan(failure.summary.length * 5);
  });

  it('drops the running commentary when there is no recognisable error', () => {
    const failure = parseFailure(
      `[2026-09-09T21:36:25Z INFO  nmstatectl] Nmstate version: 2.2.54
[2026-09-09T21:36:25Z INFO  nmstate::nm::show] Got unsupported interface type wireguard
something actually went wrong`
    );
    expect(failure.recognised).toBe(false);
    expect(failure.summary).toBe('something actually went wrong');
  });

  it('copes with an empty message', () => {
    expect(parseFailure('')).toEqual({ summary: '', detail: '', recognised: false });
  });
});

describe('retriesFor', () => {
  it('reads the count for the generation being applied', () => {
    // The enactment records retries per policy generation.
    expect(retriesFor({ '1': 5 }, 1)).toBe(5);
    expect(retriesFor({ '1': 5, '2': 2 }, 2)).toBe(2);
  });

  it('falls back to the highest count when the generation is unknown', () => {
    expect(retriesFor({ '1': 5, '2': 2 }, null)).toBe(5);
    expect(retriesFor(undefined, 1)).toBe(0);
  });
});

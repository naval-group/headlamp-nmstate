import { describe, expect, it } from 'vitest';
import {
  BOND_MODE_INFO,
  BOND_MODES,
  BOND_OPTIONS,
  conflictFor,
  optionsForMode,
} from './bondOptions';

describe('optionsForMode', () => {
  it('offers LACP options only in 802.3ad', () => {
    // nmstate rejects the policy outright when these appear in another mode.
    for (const key of ['lacp_rate', 'lacp_active', 'ad_select', 'min_links']) {
      expect(optionsForMode('802.3ad').map(o => o.key)).toContain(key);
      expect(optionsForMode('active-backup').map(o => o.key)).not.toContain(key);
    }
  });

  it('withholds ARP monitoring from the modes nmstate refuses it in', () => {
    for (const mode of ['802.3ad', 'balance-tlb', 'balance-alb']) {
      expect(optionsForMode(mode).map(o => o.key)).not.toContain('arp_interval');
    }
    expect(optionsForMode('active-backup').map(o => o.key)).toContain('arp_interval');
    expect(optionsForMode('balance-rr').map(o => o.key)).toContain('arp_interval');
  });

  it('offers the transmit hash policy where it has an effect', () => {
    for (const mode of ['balance-xor', '802.3ad', 'balance-tlb']) {
      expect(optionsForMode(mode).map(o => o.key)).toContain('xmit_hash_policy');
    }
    expect(optionsForMode('active-backup').map(o => o.key)).not.toContain('xmit_hash_policy');
  });

  it('offers link monitoring in every mode', () => {
    for (const mode of ['balance-rr', 'active-backup', '802.3ad', 'balance-alb']) {
      expect(optionsForMode(mode).map(o => o.key)).toContain('miimon');
    }
  });
});

describe('conflictFor', () => {
  it('reports the pair nmstate refuses together', () => {
    expect(conflictFor('miimon', { arp_interval: 100 })).toContain('both');
    expect(conflictFor('arp_interval', { miimon: 100 })).toContain('both');
  });

  it('stays quiet when only one of them is set', () => {
    expect(conflictFor('miimon', { arp_interval: 0 })).toBeNull();
    expect(conflictFor('miimon', {})).toBeNull();
    expect(conflictFor('arp_interval', { miimon: 0 })).toBeNull();
  });
});

describe('the catalogue itself', () => {
  it('documents every option and every enum value', () => {
    for (const spec of BOND_OPTIONS) {
      expect(spec.help, spec.key).toBeTruthy();
      if (spec.kind === 'enum') {
        expect(spec.choices?.length, spec.key).toBeGreaterThan(0);
        for (const choice of spec.choices ?? []) {
          expect(choice.help, `${spec.key}.${choice.value}`).toBeTruthy();
        }
      }
    }
  });

  it('validates the MAC-shaped option', () => {
    const spec = BOND_OPTIONS.find(o => o.key === 'ad_actor_system');
    expect(spec?.validate?.('00:11:22:33:44:55')).toBeNull();
    expect(spec?.validate?.('nope')).toBeTruthy();
  });
});

describe('BOND_MODE_INFO', () => {
  it('covers every mode the form offers', () => {
    for (const mode of BOND_MODES) {
      expect(BOND_MODE_INFO[mode], mode).toBeDefined();
      expect(BOND_MODE_INFO[mode].switchSide, mode).toBeTruthy();
      expect(BOND_MODE_INFO[mode].traffic, mode).toBeTruthy();
    }
  });

  it('marks the modes that need the switch to group the ports', () => {
    // Hashing and round-robin only work if the switch treats the members as
    // one link; the failover and load-balancing modes deliberately do not.
    for (const mode of ['balance-rr', 'balance-xor', 'broadcast', '802.3ad']) {
      expect(BOND_MODE_INFO[mode].needsSwitchConfig, mode).toBe(true);
    }
    for (const mode of ['active-backup', 'balance-tlb', 'balance-alb']) {
      expect(BOND_MODE_INFO[mode].needsSwitchConfig, mode).toBe(false);
    }
  });

  it('singles out 802.3ad as the one needing LACP', () => {
    expect(BOND_MODE_INFO['802.3ad'].switchSide).toContain('LACP');
    expect(BOND_MODE_INFO['balance-xor'].switchSide).toContain('without LACP');
  });
});

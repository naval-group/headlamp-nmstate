import { describe, expect, it } from 'vitest';
import {
  checkCaptureName,
  checkDestination,
  checkInterfaceName,
  checkIpList,
  checkIpWithPrefix,
  checkMacAddress,
  checkMaxUnavailable,
  checkNumber,
  checkPciAddress,
  isIpv4,
  isIpv6,
  parseOptionalNumber,
} from './validation';

describe('checkMacAddress', () => {
  it('accepts the form nmstate writes', () => {
    expect(checkMacAddress('B0:7B:25:0D:51:4E').valid).toBe(true);
    expect(checkMacAddress('b0:7b:25:0d:51:4e').valid).toBe(true);
  });

  it('rejects other separators, lengths and stray characters', () => {
    for (const value of [
      'B0-7B-25-0D-51-4E',
      'B07B250D514E',
      'B0:7B:25:0D:51',
      'B0:7B:25:0D:51:4E:8F',
      'ZZ:7B:25:0D:51:4E',
      'B0:7B:25:0D:51:4E; rm -rf /',
      '',
    ]) {
      expect(checkMacAddress(value).valid, value).toBe(false);
    }
  });
});

describe('checkPciAddress', () => {
  it('accepts the addresses nmstate itself uses', () => {
    for (const value of ['0000:00:1f.6', '0000:0a:09.7', '0000:ab:cd.0', '0000:af:00.1']) {
      expect(checkPciAddress(value).valid, value).toBe(true);
    }
  });

  it('rejects malformed addresses', () => {
    for (const value of ['00:1f.6', '0000:00:1f', '0000:00:1f.9', 'gggg:00:1f.6', '']) {
      expect(checkPciAddress(value).valid, value).toBe(false);
    }
  });
});

describe('checkInterfaceName', () => {
  it('accepts ordinary names', () => {
    for (const value of ['br0', 'bond0', 'eth0.100', 'eth0']) {
      expect(checkInterfaceName(value).valid, value).toBe(true);
    }
  });

  it('rejects what the kernel will not store', () => {
    // IFNAMSIZ leaves fifteen characters, and a name may not contain a slash
    // or whitespace, nor be a directory entry the kernel reserves.
    expect(checkInterfaceName('a'.repeat(15)).valid).toBe(true);
    expect(checkInterfaceName('a'.repeat(16)).valid).toBe(false);
    for (const value of ['eth 0', 'eth/0', '.', '..', '']) {
      expect(checkInterfaceName(value).valid, value).toBe(false);
    }
  });
});

describe('IP addresses', () => {
  it('accepts real addresses of both families', () => {
    for (const v of ['192.168.0.1', '10.0.0.255', '0.0.0.0', '255.255.255.255']) {
      expect(isIpv4(v), v).toBe(true);
    }
    for (const v of ['fd00::10', '::1', 'fe80::1c11:aeff:fe5e:1f44', '2001:db8::8a2e:370:7334']) {
      expect(isIpv6(v), v).toBe(true);
    }
  });

  it('rejects octets above 255, which a lax pattern would let through', () => {
    for (const v of ['999.1.1.1', '256.0.0.1', '1.2.3', '1.2.3.4.5', 'not-an-ip', '']) {
      expect(isIpv4(v), v).toBe(false);
    }
  });
});

describe('checkIpWithPrefix', () => {
  it('accepts an address carrying its prefix', () => {
    expect(checkIpWithPrefix('192.168.0.10/24', 'ipv4').valid).toBe(true);
    expect(checkIpWithPrefix('fd00::10/64', 'ipv6').valid).toBe(true);
  });

  it('refuses to invent a missing prefix', () => {
    // Defaulting to /24 turns a typo into a policy that looks right and puts
    // the node on the wrong subnet.
    const check = checkIpWithPrefix('192.168.0.10', 'ipv4');
    expect(check.valid).toBe(false);
    expect(check.message).toContain('prefix');
  });

  it('rejects a prefix that is not a number or is too long', () => {
    expect(checkIpWithPrefix('192.168.0.10/abc', 'ipv4').valid).toBe(false);
    expect(checkIpWithPrefix('192.168.0.10/33', 'ipv4').valid).toBe(false);
    expect(checkIpWithPrefix('fd00::10/129', 'ipv6').valid).toBe(false);
    expect(checkIpWithPrefix('fd00::10/128', 'ipv6').valid).toBe(true);
  });

  it('rejects an address of the wrong family', () => {
    expect(checkIpWithPrefix('fd00::10/64', 'ipv4').valid).toBe(false);
    expect(checkIpWithPrefix('192.168.0.10/24', 'ipv6').valid).toBe(false);
  });
});

describe('checkDestination', () => {
  it('accepts the default route of either family', () => {
    expect(checkDestination('0.0.0.0/0').valid).toBe(true);
    expect(checkDestination('::/0').valid).toBe(true);
  });

  it('accepts a network and rejects a bare address', () => {
    expect(checkDestination('10.0.0.0/8').valid).toBe(true);
    expect(checkDestination('10.0.0.1').valid).toBe(false);
  });
});

describe('checkIpList', () => {
  it('accepts a comma-separated list', () => {
    expect(checkIpList('192.168.0.1, 192.168.0.2').valid).toBe(true);
  });

  it('names the entry that is wrong', () => {
    const check = checkIpList('192.168.0.1, nope');
    expect(check.valid).toBe(false);
    expect(check.message).toContain('nope');
  });
});

describe('checkMaxUnavailable', () => {
  it('accepts a count, a percentage, or nothing', () => {
    for (const v of ['', '3', '50%', '100%']) {
      expect(checkMaxUnavailable(v).valid, v).toBe(true);
    }
  });

  it('rejects nonsense and percentages above 100', () => {
    for (const v of ['half', '101%', '-1', '50 %']) {
      expect(checkMaxUnavailable(v).valid, v).toBe(false);
    }
  });
});

describe('checkCaptureName', () => {
  it('accepts a name a template can address', () => {
    expect(checkCaptureName('default-gw').valid).toBe(true);
    expect(checkCaptureName('base_iface2').valid).toBe(true);
  });

  it('rejects dots and spaces, which break the reference', () => {
    // A reference is parsed on dots, so a dotted name addresses something else.
    expect(checkCaptureName('base.iface').valid).toBe(false);
    expect(checkCaptureName('base iface').valid).toBe(false);
    expect(checkCaptureName('').valid).toBe(false);
  });
});

describe('checkNumber', () => {
  it('holds each field to the range nmstate and the kernel allow', () => {
    expect(checkNumber(4094, 'vlan-id').valid).toBe(true);
    expect(checkNumber(4095, 'vlan-id').valid).toBe(false);
    expect(checkNumber(0, 'vlan-id').valid).toBe(false);
    expect(checkNumber(65535, 'port').valid).toBe(true);
    expect(checkNumber(0, 'port').valid).toBe(false);
    expect(checkNumber(67, 'mtu').valid).toBe(false);
    expect(checkNumber(1500, 'mtu').valid).toBe(true);
  });

  it('treats unset as acceptable and NaN as not', () => {
    expect(checkNumber(undefined, 'vlan-id').valid).toBe(true);
    expect(checkNumber(NaN, 'vlan-id').valid).toBe(false);
  });
});

describe('parseOptionalNumber', () => {
  it('reads an empty field as unset rather than zero', () => {
    // Number('') is 0, which used to write `id: 0` when a field was cleared.
    expect(parseOptionalNumber('')).toBeUndefined();
    expect(parseOptionalNumber('   ')).toBeUndefined();
    expect(parseOptionalNumber('0')).toBe(0);
    expect(parseOptionalNumber('100')).toBe(100);
  });

  it('reads unparseable text as unset rather than NaN', () => {
    // NaN serialises to null, which reaches the cluster as an explicit null.
    expect(parseOptionalNumber('abc')).toBeUndefined();
  });
});

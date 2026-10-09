import { createRateLimiter, isAnthropicEgress } from '../rate-limit';

describe('createRateLimiter', () => {
  it('allows up to rpm requests then blocks within the window', () => {
    const allow = createRateLimiter({ rpm: 3 });
    expect(allow('1.1.1.1')).toBe(true);
    expect(allow('1.1.1.1')).toBe(true);
    expect(allow('1.1.1.1')).toBe(true);
    expect(allow('1.1.1.1')).toBe(false);
  });

  it('tracks IPs independently', () => {
    const allow = createRateLimiter({ rpm: 1 });
    expect(allow('a')).toBe(true);
    expect(allow('b')).toBe(true);
    expect(allow('a')).toBe(false);
  });
});

describe('isAnthropicEgress', () => {
  it('recognizes the whole 160.79.104.0/21 range', () => {
    expect(isAnthropicEgress('160.79.104.0')).toBe(true);
    expect(isAnthropicEgress('160.79.107.42')).toBe(true);
    expect(isAnthropicEgress('160.79.111.255')).toBe(true);
    expect(isAnthropicEgress('::ffff:160.79.105.3')).toBe(true);
  });

  it('rejects the neighbours of the range and everything else', () => {
    expect(isAnthropicEgress('160.79.103.255')).toBe(false);
    expect(isAnthropicEgress('160.79.112.0')).toBe(false);
    expect(isAnthropicEgress('160.79.1040.1')).toBe(false);
    expect(isAnthropicEgress('203.0.113.7')).toBe(false);
    expect(isAnthropicEgress('unknown')).toBe(false);
  });
});

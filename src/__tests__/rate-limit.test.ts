import { createRateLimiter } from '../rate-limit';

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

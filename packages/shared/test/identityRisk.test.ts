import { describe, expect, it } from 'vitest';
import { assessIdentityRisk, CATEGORY_RISK, failsClosed, VERIFICATION_TTL_HOURS } from '../src';

// Fixed clock so staleness maths never depends on the wall clock.
const daytime = new Date('2026-07-29T10:00:00');
const fresh = new Date(daytime.getTime() - 60_000);
const stale = new Date(daytime.getTime() - (VERIFICATION_TTL_HOURS + 1) * 3_600_000);

describe('identity risk — category tiers', () => {
  it('ranks school bus highest and car lowest', () => {
    expect(CATEGORY_RISK.school_bus).toBe('critical');
    expect(CATEGORY_RISK.car).toBe('standard');
  });

  it('fails closed for critical and high categories only', () => {
    expect(failsClosed('school_bus')).toBe(true);
    expect(failsClosed('crane')).toBe(true);
    expect(failsClosed('bus')).toBe(true);
    expect(failsClosed('car')).toBe(false);
    expect(failsClosed('truck')).toBe(false);
  });
});

describe('identity risk — when to challenge', () => {
  it('always challenges a school bus, even for a trusted veteran driver', () => {
    const v = assessIdentityRisk({ category: 'school_bus', lastVerifiedAt: fresh, tripsCompleted: 500, at: daytime });
    expect(v.action).toBe('challenge');
    expect(v.failClosed).toBe(true);
  });

  it('passes a routine car trip for an established, recently-verified driver', () => {
    const v = assessIdentityRisk({ category: 'car', lastVerifiedAt: fresh, tripsCompleted: 200, at: daytime });
    expect(v.action).toBe('pass');
    expect(v.score).toBe(0);
  });

  it('challenges when the driver has never been verified', () => {
    const v = assessIdentityRisk({ category: 'car', lastVerifiedAt: null, tripsCompleted: 200, at: daytime });
    expect(v.reasons).toContain('never_verified');
    expect(v.action).toBe('challenge');
  });

  it('challenges on a new device even for a low-risk category', () => {
    const v = assessIdentityRisk({ category: 'car', lastVerifiedAt: fresh, tripsCompleted: 200, isNewDevice: true, at: daytime });
    expect(v.reasons).toContain('new_device');
    expect(v.action).toBe('challenge');
  });

  it('challenges once verification goes stale', () => {
    const v = assessIdentityRisk({ category: 'truck', lastVerifiedAt: stale, tripsCompleted: 200, at: daytime });
    expect(v.reasons).toContain('stale_verification');
    expect(v.action).toBe('challenge');
  });

  it('treats a brand-new driver as riskier than a veteran', () => {
    const rookie = assessIdentityRisk({ category: 'car', lastVerifiedAt: fresh, tripsCompleted: 1, at: daytime });
    const veteran = assessIdentityRisk({ category: 'car', lastVerifiedAt: fresh, tripsCompleted: 300, at: daytime });
    expect(rookie.score).toBeGreaterThan(veteran.score);
  });
});

describe('identity risk — blocking', () => {
  it('blocks when two hard signals stack (new device + failed check)', () => {
    const v = assessIdentityRisk({ category: 'car', lastVerifiedAt: null, hadRecentFailure: true, tripsCompleted: 50, at: daytime });
    expect(v.action).toBe('block');
  });

  it('blocks on a failed check plus a teleporting location', () => {
    const v = assessIdentityRisk({ category: 'truck', lastVerifiedAt: fresh, hadRecentFailure: true, hadLocationJump: true, tripsCompleted: 50, at: daytime });
    expect(v.action).toBe('block');
  });

  it('a single hard signal challenges rather than blocks', () => {
    const v = assessIdentityRisk({ category: 'car', lastVerifiedAt: fresh, hadRecentFailure: true, tripsCompleted: 50, at: daytime });
    expect(v.action).toBe('challenge');
  });
});

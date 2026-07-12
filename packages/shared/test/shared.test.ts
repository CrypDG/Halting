import { describe, expect, it } from 'vitest';
import {
  calculateFare,
  canTransition,
  generateStartOtp,
  haversineKm,
  licensePermitsCategory,
  overtimeHoursFor,
  permittedCategories,
} from '../src';

describe('license ↔ category matching (PRD §3.3)', () => {
  it('LMV permits car and tractor only', () => {
    expect(permittedCategories(['LMV'])).toEqual(['car', 'tractor']);
  });

  it('HMV alone permits truck and earth mover, not bus or crane', () => {
    expect(licensePermitsCategory(['HMV'], 'truck')).toBe(true);
    expect(licensePermitsCategory(['HMV'], 'earth_mover')).toBe(true);
    expect(licensePermitsCategory(['HMV'], 'bus')).toBe(false);
    expect(licensePermitsCategory(['HMV'], 'crane')).toBe(false);
  });

  it('bus needs PSV badge on top of HMV/HPMV', () => {
    expect(licensePermitsCategory(['HMV', 'PSV'], 'bus')).toBe(true);
    expect(licensePermitsCategory(['HPMV', 'PSV'], 'bus')).toBe(true);
  });

  it('school bus needs HPMV + PSV + endorsement', () => {
    expect(licensePermitsCategory(['HPMV', 'PSV'], 'school_bus')).toBe(false);
    expect(licensePermitsCategory(['HPMV', 'PSV', 'SCHOOL_BUS_ENDORSEMENT'], 'school_bus')).toBe(true);
  });

  it('crane needs HMV + HTV; CEV alone permits earth mover', () => {
    expect(licensePermitsCategory(['HMV', 'HTV'], 'crane')).toBe(true);
    expect(licensePermitsCategory(['CEV'], 'earth_mover')).toBe(true);
    expect(licensePermitsCategory(['CEV'], 'truck')).toBe(false);
  });
});

describe('trip state machine (PRD §8)', () => {
  it('follows the happy path', () => {
    expect(canTransition('requested', 'accepted')).toBe(true);
    expect(canTransition('accepted', 'driver_arrived')).toBe(true);
    expect(canTransition('driver_arrived', 'started')).toBe(true);
    expect(canTransition('started', 'in_progress')).toBe(true);
    expect(canTransition('in_progress', 'completed')).toBe(true);
    expect(canTransition('completed', 'paid')).toBe(true);
    expect(canTransition('paid', 'closed')).toBe(true);
  });

  it('rejects illegal jumps', () => {
    expect(canTransition('requested', 'started')).toBe(false);
    expect(canTransition('closed', 'requested')).toBe(false);
    expect(canTransition('in_progress', 'cancelled_by_driver')).toBe(false);
  });

  it('allows expiry only from requested, disputes resolve to closed', () => {
    expect(canTransition('requested', 'expired')).toBe(true);
    expect(canTransition('accepted', 'expired')).toBe(false);
    expect(canTransition('disputed', 'closed')).toBe(true);
  });

  it('generates a 4-digit start OTP', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateStartOtp()).toMatch(/^\d{4}$/);
    }
  });
});

describe('fare calculator (PRD §4.4)', () => {
  it('per-km: distance × rate', () => {
    expect(calculateFare({ tripType: 'per_km', distanceKm: 42.5, pricing: { pricePerKm: 12, pricePerDay: null, overtimePerHour: null } }))
      .toEqual({ base: 510, overtime: 0, total: 510 });
  });

  it('per-day: days × rate + overtime', () => {
    expect(calculateFare({ tripType: 'per_day', days: 2, overtimeHours: 3, pricing: { pricePerKm: null, pricePerDay: 1500, overtimePerHour: 200 } }))
      .toEqual({ base: 3000, overtime: 600, total: 3600 });
  });

  it('overtime kicks in beyond 8h/day', () => {
    expect(overtimeHoursFor(1, 8)).toBe(0);
    expect(overtimeHoursFor(1, 11.5)).toBe(3.5);
    expect(overtimeHoursFor(2, 15)).toBe(0);
  });

  it('rejects missing rates or inputs', () => {
    expect(() => calculateFare({ tripType: 'per_km', pricing: { pricePerKm: 12, pricePerDay: null, overtimePerHour: null } })).toThrow();
    expect(() => calculateFare({ tripType: 'per_km', distanceKm: 10, pricing: { pricePerKm: null, pricePerDay: 1000, overtimePerHour: null } })).toThrow();
    expect(() => calculateFare({ tripType: 'per_day', days: 0, pricing: { pricePerKm: null, pricePerDay: 1000, overtimePerHour: null } })).toThrow();
  });

  it('haversine: Chennai Central → Chennai Airport ≈ 15–20 km', () => {
    const km = haversineKm({ lat: 13.0827, lng: 80.2707 }, { lat: 12.9941, lng: 80.1709 });
    expect(km).toBeGreaterThan(13);
    expect(km).toBeLessThan(20);
  });
});

import { DAY_HOURS, type FareBreakdown, type FareInput } from './types';

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Fare rules (PRD §4.3.7 / §4.4):
 *  - per_km: actual GPS distance × driver's per-km rate
 *  - per_day: days × day rate (8-hour day) + overtime hours × overtime rate
 */
export function calculateFare(input: FareInput): FareBreakdown {
  if (input.tripType === 'per_km') {
    const { distanceKm, pricing } = input;
    if (distanceKm == null || distanceKm < 0) throw new Error('distanceKm required for per_km trip');
    if (pricing.pricePerKm == null) throw new Error('Driver has no per-km rate for this category');
    const base = round2(distanceKm * pricing.pricePerKm);
    return { base, overtime: 0, total: base };
  }

  const { days, overtimeHours = 0, pricing } = input;
  if (days == null || days < 1) throw new Error('days (≥1) required for per_day trip');
  if (pricing.pricePerDay == null) throw new Error('Driver has no per-day rate for this category');
  if (overtimeHours < 0) throw new Error('overtimeHours cannot be negative');

  const base = round2(days * pricing.pricePerDay);
  const overtime = round2(overtimeHours * (pricing.overtimePerHour ?? 0));
  return { base, overtime, total: round2(base + overtime) };
}

/** Overtime hours for a per_day trip given actual worked hours. */
export function overtimeHoursFor(days: number, actualHours: number): number {
  return Math.max(0, actualHours - days * DAY_HOURS);
}

/** Haversine distance in km between two lat/lng points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

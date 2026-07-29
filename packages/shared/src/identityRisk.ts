import type { VehicleCategorySlug } from './types';

/**
 * Driver identity assurance (PRD §3.4, §10 "account sharing").
 *
 * The threat: a verified driver passes onboarding, then someone else actually
 * drives. Device biometrics (fingerprint / pattern) CANNOT detect this — they
 * only prove someone enrolled on that handset unlocked it. The real control is
 * a liveness-checked face match against the Aadhaar reference, evaluated
 * server-side at trip start.
 *
 * Face matching costs money and latency per call, so at scale we can't run it
 * on every trip. This module decides WHEN to challenge, and what happens when
 * a challenge can't be completed.
 */

export type RiskReason =
  | 'new_device'
  | 'stale_verification'
  | 'never_verified'
  | 'high_risk_category'
  | 'new_driver'
  | 'night_trip'
  | 'recent_failure'
  | 'location_jump';

export type VerificationAction = 'pass' | 'challenge' | 'block';

/** How much we care about getting identity right, per vehicle category. */
export type CategoryRisk = 'critical' | 'high' | 'medium' | 'standard';

export const CATEGORY_RISK: Record<VehicleCategorySlug, CategoryRisk> = {
  school_bus: 'critical',  // children on board — highest bar in the PRD
  bus: 'high',             // many passengers
  crane: 'high',           // heavy equipment, site safety
  earth_mover: 'high',
  truck: 'medium',         // valuable load
  tractor: 'medium',
  car: 'standard',
};

/**
 * Fail-closed categories: if we cannot positively verify the driver, the trip
 * does NOT start — even offline, even if it costs the driver a fare.
 */
export const FAIL_CLOSED: CategoryRisk[] = ['critical', 'high'];
export const failsClosed = (category: VehicleCategorySlug) =>
  FAIL_CLOSED.includes(CATEGORY_RISK[category]);

/** Re-verify at least this often, even for a low-risk driver on a known device. */
export const VERIFICATION_TTL_HOURS = 12;

const WEIGHTS: Record<RiskReason, number> = {
  never_verified: 100,   // no reference check has ever passed
  recent_failure: 60,    // a check failed recently — treat as hostile until proven
  new_device: 45,        // classic account-handoff signal
  location_jump: 40,     // presence teleported — likely two people/devices
  high_risk_category: 35,
  stale_verification: 25,
  new_driver: 20,        // little history to trust
  night_trip: 10,
};

/**
 * Any one of these forces a face check regardless of the numeric score —
 * either we've never confirmed this face, or something changed since we did.
 * This is what makes VERIFICATION_TTL_HOURS meaningful: every driver re-checks
 * at least twice a day, which is cheap, plus on any anomaly.
 */
const ESCALATING: RiskReason[] = ['never_verified', 'stale_verification', 'recent_failure', 'new_device', 'location_jump'];

/**
 * Genuinely adversarial signals. Two of these stacked means a human reviews
 * before the driver works again. Deliberately excludes new_device and
 * stale_verification — a driver on a new phone the next morning is routine,
 * not an attack, and must not be locked out of earning.
 */
const BLOCKING: RiskReason[] = ['never_verified', 'recent_failure', 'location_jump'];

/** Challenge thresholds by category risk — stricter vehicles challenge sooner. */
const CHALLENGE_AT: Record<CategoryRisk, number> = {
  critical: 0,   // always challenge
  high: 30,
  medium: 55,
  standard: 65,
};

export interface RiskInput {
  category: VehicleCategorySlug;
  /** Last time a face match passed for this driver, if ever. */
  lastVerifiedAt?: Date | string | null;
  /** Device fingerprint is not among the driver's known devices. */
  isNewDevice?: boolean;
  /** A verification attempt failed within the recent window. */
  hadRecentFailure?: boolean;
  /** Implausible jump between the driver's last known position and now. */
  hadLocationJump?: boolean;
  tripsCompleted?: number;
  /** Trip start time (defaults to now) — night trips carry a little more risk. */
  at?: Date;
}

export interface RiskVerdict {
  score: number;
  reasons: RiskReason[];
  action: VerificationAction;
  categoryRisk: CategoryRisk;
  /** If the challenge can't be completed, may the trip still start? */
  failClosed: boolean;
}

export function assessIdentityRisk(input: RiskInput): RiskVerdict {
  const categoryRisk = CATEGORY_RISK[input.category] ?? 'standard';
  const reasons: RiskReason[] = [];
  const at = input.at ?? new Date();

  const last = input.lastVerifiedAt ? new Date(input.lastVerifiedAt) : null;
  if (!last || Number.isNaN(last.getTime())) {
    reasons.push('never_verified');
  } else if ((at.getTime() - last.getTime()) / 3_600_000 > VERIFICATION_TTL_HOURS) {
    reasons.push('stale_verification');
  }

  if (input.isNewDevice) reasons.push('new_device');
  if (input.hadRecentFailure) reasons.push('recent_failure');
  if (input.hadLocationJump) reasons.push('location_jump');
  if (categoryRisk === 'critical' || categoryRisk === 'high') reasons.push('high_risk_category');
  if ((input.tripsCompleted ?? 0) < 5) reasons.push('new_driver');

  const hour = at.getHours();
  if (hour >= 22 || hour < 6) reasons.push('night_trip');

  const score = reasons.reduce((sum, r) => sum + WEIGHTS[r], 0);

  const escalating = reasons.some((r) => ESCALATING.includes(r));
  const blocking = reasons.filter((r) => BLOCKING.includes(r)).length;

  const action: VerificationAction =
    blocking >= 2 ? 'block'
      : escalating || score >= CHALLENGE_AT[categoryRisk] ? 'challenge'
      : 'pass';

  return { score, reasons, action, categoryRisk, failClosed: failsClosed(input.category) };
}

/** Plain-language explanation for the driver — never expose raw scores. */
export function explainChallenge(verdict: RiskVerdict): string {
  if (verdict.reasons.includes('never_verified')) return 'Confirm it’s you before your first trip.';
  if (verdict.reasons.includes('new_device')) return 'New device detected — confirm it’s you.';
  if (verdict.reasons.includes('recent_failure')) return 'Last check didn’t match. Let’s try again.';
  if (verdict.categoryRisk === 'critical') return 'School-bus trips need a face check every time.';
  if (verdict.categoryRisk === 'high') return 'Heavy vehicles need a quick face check.';
  return 'Quick face check to confirm it’s you.';
}

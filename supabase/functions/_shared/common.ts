import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

export function errorResponse(e: unknown): Response {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: e instanceof Error ? e.message : 'Internal error' }, 500);
}

export function handleOptions(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response('ok', { headers: cors }) : null;
}

/** Service-role client — bypasses RLS; every mutation must re-check the caller. */
export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function getCaller(req: Request, supa: SupabaseClient) {
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '');
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Unauthorized');
  return data.user;
}

// ── Business rules (mirror of @acting/shared — keep in sync) ─────────────
export type TripStatus =
  | 'requested' | 'accepted' | 'driver_arrived' | 'started' | 'in_progress'
  | 'completed' | 'paid' | 'closed'
  | 'cancelled_by_customer' | 'cancelled_by_driver' | 'expired' | 'disputed';

export const TRIP_TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  requested: ['accepted', 'expired', 'cancelled_by_customer'],
  accepted: ['driver_arrived', 'cancelled_by_customer', 'cancelled_by_driver'],
  driver_arrived: ['started', 'cancelled_by_customer', 'cancelled_by_driver'],
  started: ['in_progress'],
  in_progress: ['completed', 'disputed'],
  completed: ['paid', 'disputed'],
  paid: ['closed', 'disputed'],
  closed: [],
  cancelled_by_customer: [],
  cancelled_by_driver: [],
  expired: [],
  disputed: ['closed'],
};

export function assertTransition(from: TripStatus, to: TripStatus): void {
  if (!TRIP_TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Illegal trip transition: ${from} → ${to}`);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
export const DAY_HOURS = 8;
export const SETUP_FEE_INR = 500;
export const SETUP_FEE_GRACE_HOURS = 72;
export const REQUEST_ACCEPT_WINDOW_SECONDS = 30;

export function calculateFare(input: {
  tripType: 'per_km' | 'per_day';
  distanceKm?: number;
  days?: number;
  overtimeHours?: number;
  pricing: { pricePerKm: number | null; pricePerDay: number | null; overtimePerHour: number | null };
}): { base: number; overtime: number; total: number } {
  if (input.tripType === 'per_km') {
    if (input.distanceKm == null || input.distanceKm < 0) throw new HttpError(400, 'distanceKm required');
    if (input.pricing.pricePerKm == null) throw new HttpError(400, 'Driver has no per-km rate for this category');
    const base = round2(input.distanceKm * input.pricing.pricePerKm);
    return { base, overtime: 0, total: base };
  }
  const days = input.days ?? 0;
  if (days < 1) throw new HttpError(400, 'days required for per_day trip');
  if (input.pricing.pricePerDay == null) throw new HttpError(400, 'Driver has no per-day rate for this category');
  const base = round2(days * input.pricing.pricePerDay);
  const overtime = round2((input.overtimeHours ?? 0) * (input.pricing.overtimePerHour ?? 0));
  return { base, overtime, total: round2(base + overtime) };
}

// ── Identity risk (mirror of @acting/shared identityRisk.ts — keep in sync) ──
export type RiskReason =
  | 'new_device' | 'stale_verification' | 'never_verified' | 'high_risk_category'
  | 'new_driver' | 'night_trip' | 'recent_failure' | 'location_jump';
export type VerificationAction = 'pass' | 'challenge' | 'block';
export type CategoryRisk = 'critical' | 'high' | 'medium' | 'standard';

export const CATEGORY_RISK: Record<string, CategoryRisk> = {
  school_bus: 'critical', bus: 'high', crane: 'high', earth_mover: 'high',
  truck: 'medium', tractor: 'medium', car: 'standard',
};
const FAIL_CLOSED: CategoryRisk[] = ['critical', 'high'];
export const failsClosed = (category: string) => FAIL_CLOSED.includes(CATEGORY_RISK[category] ?? 'standard');

export const VERIFICATION_TTL_HOURS = 12;

const WEIGHTS: Record<RiskReason, number> = {
  never_verified: 100, recent_failure: 60, new_device: 45, location_jump: 40,
  high_risk_category: 35, stale_verification: 25, new_driver: 20, night_trip: 10,
};
const ESCALATING: RiskReason[] = ['never_verified', 'stale_verification', 'recent_failure', 'new_device', 'location_jump'];
const BLOCKING: RiskReason[] = ['never_verified', 'recent_failure', 'location_jump'];
const CHALLENGE_AT: Record<CategoryRisk, number> = { critical: 0, high: 30, medium: 55, standard: 65 };

export function assessIdentityRisk(input: {
  category: string;
  lastVerifiedAt?: Date | string | null;
  isNewDevice?: boolean;
  hadRecentFailure?: boolean;
  hadLocationJump?: boolean;
  tripsCompleted?: number;
  at?: Date;
}): { score: number; reasons: RiskReason[]; action: VerificationAction; categoryRisk: CategoryRisk; failClosed: boolean } {
  const categoryRisk = CATEGORY_RISK[input.category] ?? 'standard';
  const reasons: RiskReason[] = [];
  const at = input.at ?? new Date();

  const last = input.lastVerifiedAt ? new Date(input.lastVerifiedAt) : null;
  if (!last || Number.isNaN(last.getTime())) reasons.push('never_verified');
  else if ((at.getTime() - last.getTime()) / 3_600_000 > VERIFICATION_TTL_HOURS) reasons.push('stale_verification');

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
    blocking >= 2 ? 'block' : escalating || score >= CHALLENGE_AT[categoryRisk] ? 'challenge' : 'pass';

  return { score, reasons, action, categoryRisk, failClosed: failsClosed(input.category) };
}

export function explainChallenge(v: { reasons: RiskReason[]; categoryRisk: CategoryRisk }): string {
  if (v.reasons.includes('never_verified')) return 'Confirm it’s you before your first trip.';
  if (v.reasons.includes('new_device')) return 'New device detected — confirm it’s you.';
  if (v.reasons.includes('recent_failure')) return 'Last check didn’t match. Let’s try again.';
  if (v.categoryRisk === 'critical') return 'School-bus trips need a face check every time.';
  if (v.categoryRisk === 'high') return 'Heavy vehicles need a quick face check.';
  return 'Quick face check to confirm it’s you.';
}

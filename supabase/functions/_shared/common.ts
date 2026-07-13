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

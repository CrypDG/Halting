import {
  errorResponse,
  getCaller,
  handleOptions,
  HttpError,
  json,
  REQUEST_ACCEPT_WINDOW_SECONDS,
  serviceClient,
} from '../_shared/common.ts';

/**
 * POST body: {
 *   category_slug, trip_type: 'per_km'|'per_day',
 *   pickup: { lat, lng, address? }, destination?: { lat, lng, address? },
 *   days?, notes?, payment_mode?: 'cash'|'in_app', radius_km?
 * }
 * Creates the trip + start OTP and offers it to the nearest matching online
 * drivers (batch of up to 5, 30-second accept window — PRD §4.3).
 */
Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  try {
    const supa = serviceClient();
    const user = await getCaller(req, supa);
    const body = await req.json();
    const { category_slug, trip_type, pickup, destination, days, notes, radius_km } = body;
    const payment_mode = body.payment_mode ?? 'cash';

    if (!category_slug || !trip_type || pickup?.lat == null || pickup?.lng == null) {
      throw new HttpError(400, 'category_slug, trip_type and pickup{lat,lng} are required');
    }
    if (trip_type === 'per_day' && !(days >= 1)) throw new HttpError(400, 'days (≥1) required for per_day trips');
    if (trip_type === 'per_km' && (destination?.lat == null || destination?.lng == null)) {
      throw new HttpError(400, 'destination{lat,lng} required for per_km trips');
    }

    // PRD §3.1: Aadhaar eKYC is mandatory before first booking.
    const { data: prof } = await supa.from('profiles').select('kyc_verified_at, role').eq('id', user.id).single();
    if (!prof) throw new HttpError(403, 'Profile not found');
    if (!prof.kyc_verified_at) throw new HttpError(403, 'Complete Aadhaar eKYC before booking');

    const { data: drivers, error: derr } = await supa.rpc('nearby_drivers', {
      p_category: category_slug,
      p_lat: pickup.lat,
      p_lng: pickup.lng,
      p_radius_km: radius_km ?? 10,
    });
    if (derr) throw new HttpError(500, derr.message);
    if (!drivers?.length) throw new HttpError(404, 'No verified drivers available nearby — try a wider radius');

    const otp = String(Math.floor(1000 + Math.random() * 9000));
    const { data: trip, error: terr } = await supa
      .from('trips')
      .insert({
        customer_id: user.id,
        category_slug,
        trip_type,
        status: 'requested',
        pickup_location: `POINT(${pickup.lng} ${pickup.lat})`,
        pickup_address: pickup.address ?? null,
        destination_location: destination ? `POINT(${destination.lng} ${destination.lat})` : null,
        destination_address: destination?.address ?? null,
        days: days ?? null,
        notes: notes ?? null,
        payment_mode,
      })
      .select('id, status, category_slug, trip_type, payment_mode, requested_at')
      .single();
    if (terr) throw new HttpError(500, terr.message);

    const { error: serr } = await supa.from('trip_secrets').insert({ trip_id: trip.id, start_otp: otp });
    if (serr) throw new HttpError(500, serr.message);

    const expiresAt = new Date(Date.now() + REQUEST_ACCEPT_WINDOW_SECONDS * 1000).toISOString();
    const batch = drivers.slice(0, 5).map((d: { driver_id: string; distance_km: number }) => ({
      trip_id: trip.id,
      driver_id: d.driver_id,
      distance_km: Math.round(d.distance_km * 100) / 100,
      expires_at: expiresAt,
    }));
    const { error: rerr } = await supa.from('trip_requests').insert(batch);
    if (rerr) throw new HttpError(500, rerr.message);

    return json({ trip, offered_drivers: batch.length });
  } catch (e) {
    return errorResponse(e);
  }
});

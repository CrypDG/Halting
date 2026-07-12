import {
  errorResponse,
  getCaller,
  handleOptions,
  HttpError,
  json,
  serviceClient,
} from '../_shared/common.ts';

/**
 * POST body: { action, driver_id? | trip_id?, reason?, fare_total?, ... }
 * Actions: approve_driver | reject_driver | suspend_driver | reinstate_driver |
 *          force_close_trip | adjust_fare | mark_fee_paid | waive_fee
 * Caller must be an admin (profiles.role = 'admin').
 */
Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  try {
    const supa = serviceClient();
    const user = await getCaller(req, supa);
    const { data: caller } = await supa.from('profiles').select('role, admin_role').eq('id', user.id).single();
    if (caller?.role !== 'admin') throw new HttpError(403, 'Admin access required');

    const body = await req.json();
    const { action, driver_id, trip_id, reason } = body;
    const now = new Date().toISOString();

    const setDriverStatus = async (status: string, extra: Record<string, unknown> = {}) => {
      if (!driver_id) throw new HttpError(400, 'driver_id required');
      const { data, error } = await supa.from('driver_profiles')
        .update({ status, reviewed_at: now, reviewed_by: user.id, ...extra })
        .eq('driver_id', driver_id).select().single();
      if (error) throw new HttpError(500, error.message);
      return data;
    };

    switch (action) {
      case 'approve_driver': {
        // Approval implies the verifier reviewed the police certificate (PRD §3.2 step 5).
        const { data: dp } = await supa.from('driver_profiles').select('*').eq('driver_id', driver_id).single();
        if (!dp) throw new HttpError(404, 'Driver not found');
        if (!['submitted', 'under_review'].includes(dp.status)) {
          throw new HttpError(409, `Driver is ${dp.status}, not awaiting review`);
        }
        if (!dp.license_verified_at) throw new HttpError(409, 'License not verified');
        if (!dp.police_cert_path) throw new HttpError(409, 'Police verification certificate missing');
        return json({ driver: await setDriverStatus('approved', { police_verified_at: now, rejection_reason: null }) });
      }
      case 'reject_driver': {
        if (!reason) throw new HttpError(400, 'reason required for rejection');
        return json({ driver: await setDriverStatus('rejected', { rejection_reason: reason }) });
      }
      case 'suspend_driver': {
        const driver = await setDriverStatus('suspended', { rejection_reason: reason ?? null });
        await supa.from('driver_presence').update({ status: 'offline' }).eq('driver_id', driver_id);
        return json({ driver });
      }
      case 'reinstate_driver':
        return json({ driver: await setDriverStatus('approved') });

      case 'force_close_trip': {
        if (!trip_id) throw new HttpError(400, 'trip_id required');
        const { data, error } = await supa.from('trips')
          .update({ status: 'closed', closed_at: now }).eq('id', trip_id).select().single();
        if (error) throw new HttpError(500, error.message);
        if (data.driver_id) {
          await supa.from('driver_presence').update({ status: 'online' }).eq('driver_id', data.driver_id);
        }
        return json({ trip: data });
      }
      case 'adjust_fare': {
        if (!trip_id || body.fare_total == null) throw new HttpError(400, 'trip_id and fare_total required');
        const { data, error } = await supa.from('trips')
          .update({ fare_total: body.fare_total, fare_adjusted_by: user.id })
          .eq('id', trip_id).select().single();
        if (error) throw new HttpError(500, error.message);
        return json({ trip: data });
      }
      case 'mark_fee_paid': {
        if (!driver_id) throw new HttpError(400, 'driver_id required');
        const { data, error } = await supa.from('setup_fees')
          .update({ status: 'paid', paid_at: now, payment_ref: `admin-${user.id.slice(0, 8)}` })
          .eq('driver_id', driver_id).select().single();
        if (error) throw new HttpError(500, error.message);
        return json({ fee: data });
      }
      case 'waive_fee': {
        if (!driver_id) throw new HttpError(400, 'driver_id required');
        const { data, error } = await supa.from('setup_fees')
          .update({ status: 'waived' }).eq('driver_id', driver_id).select().single();
        if (error) throw new HttpError(500, error.message);
        return json({ fee: data });
      }
      default:
        throw new HttpError(400, `Unknown action: ${action}`);
    }
  } catch (e) {
    return errorResponse(e);
  }
});

import {
  assertTransition,
  calculateFare,
  DAY_HOURS,
  errorResponse,
  getCaller,
  handleOptions,
  HttpError,
  json,
  SETUP_FEE_GRACE_HOURS,
  SETUP_FEE_INR,
  serviceClient,
  type TripStatus,
} from '../_shared/common.ts';

/**
 * POST body: { action, trip_id?, otp?, payment_mode? }
 * Actions: accept | decline | arrive | start | end | set_payment_mode |
 *          cash_collected | confirm_cash | pay_in_app | close | cancel |
 *          pay_setup_fee
 * All trip writes go through this function (service role) so the PRD §8 state
 * machine and party checks are enforced server-side.
 */
Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  try {
    const supa = serviceClient();
    const user = await getCaller(req, supa);
    const { action, trip_id, otp, payment_mode } = await req.json();
    if (!action) throw new HttpError(400, 'action required');

    // pay_setup_fee is driver-scoped, not trip-scoped
    if (action === 'pay_setup_fee') {
      const { data: fee } = await supa.from('setup_fees').select('*').eq('driver_id', user.id).single();
      if (!fee) throw new HttpError(404, 'No setup fee due');
      if (fee.status !== 'pending') throw new HttpError(409, `Setup fee already ${fee.status}`);
      // Mock UPI charge — replace with real PSP integration.
      const ref = `mockpay-setupfee-${user.id.slice(0, 8)}-${Date.now()}`;
      await supa.from('setup_fees')
        .update({ status: 'paid', paid_at: new Date().toISOString(), payment_ref: ref })
        .eq('driver_id', user.id);
      return json({ ok: true, payment_ref: ref });
    }

    if (!trip_id) throw new HttpError(400, 'trip_id required');
    const { data: trip, error: terr } = await supa.from('trips').select('*').eq('id', trip_id).single();
    if (terr || !trip) throw new HttpError(404, 'Trip not found');

    const isCustomer = trip.customer_id === user.id;
    const isDriver = trip.driver_id === user.id;
    const now = new Date().toISOString();
    const status = trip.status as TripStatus;

    const update = async (patch: Record<string, unknown>) => {
      const { data, error } = await supa.from('trips').update(patch).eq('id', trip_id).select().single();
      if (error) throw new HttpError(500, error.message);
      return data;
    };
    const setPresence = async (driverId: string, s: 'online' | 'busy' | 'offline') => {
      await supa.from('driver_presence').update({ status: s, last_seen_at: now }).eq('driver_id', driverId);
    };
    const expirePendingRequests = async () => {
      await supa.from('trip_requests').update({ status: 'expired' })
        .eq('trip_id', trip_id).eq('status', 'pending');
    };

    switch (action) {
      case 'accept': {
        const { data: reqRow } = await supa.from('trip_requests').select('*')
          .eq('trip_id', trip_id).eq('driver_id', user.id).eq('status', 'pending').maybeSingle();
        if (!reqRow) throw new HttpError(403, 'No pending request for this driver');
        if (new Date(reqRow.expires_at) < new Date()) {
          await supa.from('trip_requests').update({ status: 'expired' }).eq('id', reqRow.id);
          throw new HttpError(410, 'Request expired');
        }
        assertTransition(status, 'accepted');
        const updated = await update({ status: 'accepted', driver_id: user.id, accepted_at: now });
        await supa.from('trip_requests').update({ status: 'accepted', responded_at: now }).eq('id', reqRow.id);
        await expirePendingRequests();
        await setPresence(user.id, 'busy'); // PRD §4.1: busy the moment a trip is accepted
        return json({ trip: updated });
      }

      case 'decline': {
        const { error } = await supa.from('trip_requests')
          .update({ status: 'declined', responded_at: now })
          .eq('trip_id', trip_id).eq('driver_id', user.id).eq('status', 'pending');
        if (error) throw new HttpError(500, error.message);
        // If nobody is left holding a live offer, the request expires (PRD §8).
        const { count } = await supa.from('trip_requests')
          .select('id', { count: 'exact', head: true })
          .eq('trip_id', trip_id).eq('status', 'pending');
        if ((count ?? 0) === 0 && status === 'requested') {
          await update({ status: 'expired' });
        }
        return json({ ok: true });
      }

      case 'arrive': {
        if (!isDriver) throw new HttpError(403, 'Only the assigned driver can do this');
        assertTransition(status, 'driver_arrived');
        return json({ trip: await update({ status: 'driver_arrived', arrived_at: now }) });
      }

      case 'start': {
        if (!isDriver) throw new HttpError(403, 'Only the assigned driver can do this');
        assertTransition(status, 'started');
        const { data: secret } = await supa.from('trip_secrets').select('start_otp').eq('trip_id', trip_id).single();
        if (!secret || secret.start_otp !== String(otp ?? '')) {
          throw new HttpError(403, 'Invalid start OTP — ask the customer for the 4-digit code');
        }
        // started is instantaneous; the trip immediately runs in_progress
        return json({ trip: await update({ status: 'in_progress', started_at: now }) });
      }

      case 'end': {
        if (!isDriver) throw new HttpError(403, 'Only the assigned driver can do this');
        assertTransition(status, 'completed');
        const { data: dc } = await supa.from('driver_categories').select('*')
          .eq('driver_id', trip.driver_id).eq('category_slug', trip.category_slug).single();
        if (!dc) throw new HttpError(500, 'Driver pricing missing for this category');
        const pricing = {
          pricePerKm: dc.price_per_km === null ? null : Number(dc.price_per_km),
          pricePerDay: dc.price_per_day === null ? null : Number(dc.price_per_day),
          overtimePerHour: dc.overtime_per_hour === null ? null : Number(dc.overtime_per_hour),
        };
        let patch: Record<string, unknown>;
        if (trip.trip_type === 'per_km') {
          const { data: dist, error: derr } = await supa.rpc('trip_distance_km', { p_trip_id: trip_id });
          if (derr) throw new HttpError(500, derr.message);
          const distanceKm = Math.round(Number(dist) * 100) / 100;
          const fare = calculateFare({ tripType: 'per_km', distanceKm, pricing });
          patch = { distance_km: distanceKm, fare_base: fare.base, fare_overtime: 0, fare_total: fare.total };
        } else {
          const hoursWorked = (Date.now() - new Date(trip.started_at).getTime()) / 3_600_000;
          const overtimeHours = Math.round(Math.max(0, hoursWorked - trip.days * DAY_HOURS) * 100) / 100;
          const fare = calculateFare({ tripType: 'per_day', days: trip.days, overtimeHours, pricing });
          patch = { overtime_hours: overtimeHours, fare_base: fare.base, fare_overtime: fare.overtime, fare_total: fare.total };
        }
        return json({ trip: await update({ ...patch, status: 'completed', completed_at: now }) });
      }

      case 'set_payment_mode': {
        // PRD §4.5: customer may change mode any time until trip closure.
        if (!isCustomer) throw new HttpError(403, 'Only the customer can set payment mode');
        if (['paid', 'closed'].includes(status)) throw new HttpError(409, 'Too late to change payment mode');
        if (!['cash', 'in_app'].includes(payment_mode)) throw new HttpError(400, 'payment_mode must be cash or in_app');
        return json({ trip: await update({ payment_mode }) });
      }

      case 'cash_collected': {
        if (!isDriver) throw new HttpError(403, 'Only the assigned driver can do this');
        if (status !== 'completed' || trip.payment_mode !== 'cash') {
          throw new HttpError(409, 'Trip must be completed with cash payment mode');
        }
        return json({ trip: await update({ payment_status: 'collected_claimed' }) });
      }

      case 'confirm_cash': {
        // PRD §4.5 dual confirmation: driver claims collection, customer confirms.
        if (!isCustomer) throw new HttpError(403, 'Only the customer can confirm payment');
        if (trip.payment_status !== 'collected_claimed') throw new HttpError(409, 'Driver has not marked cash collected yet');
        assertTransition(status, 'paid');
        return json({ trip: await update({ status: 'paid', payment_status: 'confirmed', paid_at: now }) });
      }

      case 'pay_in_app': {
        if (!isCustomer) throw new HttpError(403, 'Only the customer can pay');
        if (trip.payment_mode !== 'in_app') throw new HttpError(409, 'Trip payment mode is not in-app');
        assertTransition(status, 'paid');
        // Mock gateway charge — replace with Razorpay/Cashfree.
        const ref = `mockpay-trip-${String(trip_id).slice(0, 8)}-${Date.now()}`;
        return json({
          trip: await update({ status: 'paid', payment_status: 'confirmed', payment_ref: ref, paid_at: now }),
          payment_ref: ref,
        });
      }

      case 'close': {
        if (!isCustomer && !isDriver) throw new HttpError(403, 'Not a party to this trip');
        assertTransition(status, 'closed');
        const updated = await update({ status: 'closed', closed_at: now });
        const { data: dp } = await supa.from('driver_profiles').select('trips_completed')
          .eq('driver_id', trip.driver_id).single();
        const completed = (dp?.trips_completed ?? 0) + 1;
        await supa.from('driver_profiles').update({ trips_completed: completed }).eq('driver_id', trip.driver_id);
        await setPresence(trip.driver_id, 'online'); // back to discoverable (PRD §4.1)
        if (completed === 1) {
          // PRD §4.6: ₹500 setup fee becomes due after the first completed trip.
          await supa.from('setup_fees').insert({
            driver_id: trip.driver_id,
            amount_inr: SETUP_FEE_INR,
            status: 'pending',
            due_at: new Date(Date.now() + SETUP_FEE_GRACE_HOURS * 3_600_000).toISOString(),
            trip_id,
          });
        }
        return json({ trip: updated });
      }

      case 'cancel': {
        let to: TripStatus;
        if (isCustomer) to = 'cancelled_by_customer';
        else if (isDriver) to = 'cancelled_by_driver';
        else throw new HttpError(403, 'Not a party to this trip');
        assertTransition(status, to);
        const updated = await update({ status: to, cancelled_at: now });
        await expirePendingRequests();
        if (trip.driver_id) await setPresence(trip.driver_id, 'online');
        return json({ trip: updated });
      }

      default:
        throw new HttpError(400, `Unknown action: ${action}`);
    }
  } catch (e) {
    return errorResponse(e);
  }
});

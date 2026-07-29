import {
  assessIdentityRisk, errorResponse, explainChallenge, getCaller,
  handleOptions, HttpError, json, serviceClient,
} from '../_shared/common.ts';

/**
 * Driver identity assurance (PRD §3.4). Two endpoints:
 *
 *  { action: 'assess', trip_id?, category?, device_id }
 *    -> risk verdict: pass | challenge | block, with a plain-language reason.
 *       Called by the app before starting a trip.
 *
 *  { action: 'submit', trip_id?, category?, device_id, selfie_base64 }
 *    -> runs liveness + face match against the Aadhaar reference, records a
 *       verification_event, updates last_verified_at, and on repeated failure
 *       places an identity hold (driver can't go online until an admin clears).
 *
 * FACE MATCHING IS MOCKED. A real deployment must use a UIDAI-licensed
 * AUA/KUA provider with genuine passive+active liveness — a mock cannot stop
 * a printed photo. Only the mockMatch() body below changes.
 */

const MATCH_THRESHOLD = 0.82;
const RECENT_FAILURE_WINDOW_MS = 6 * 3_600_000;
const FAILURES_BEFORE_HOLD = 3;

/** MOCK matcher — deterministic pass. Replace with a licensed provider. */
async function mockMatch(_selfieBase64: string): Promise<{ matchScore: number; livenessPassed: boolean }> {
  return { matchScore: 0.94, livenessPassed: true };
}

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  try {
    const supa = serviceClient();
    const user = await getCaller(req, supa);
    const body = await req.json();
    const { action, trip_id, device_id } = body;

    const { data: dp } = await supa
      .from('driver_profiles')
      .select('driver_id, trips_completed, last_verified_at, identity_hold, identity_hold_reason')
      .eq('driver_id', user.id).maybeSingle();
    if (!dp) throw new HttpError(403, 'Not a registered driver');

    if (dp.identity_hold) {
      return json({
        action: 'block',
        held: true,
        message: dp.identity_hold_reason ?? 'Your account is on hold pending an identity review.',
      });
    }

    // Category comes from the trip when there is one, so a driver can't
    // downgrade the risk tier by lying about what they're driving.
    let category = body.category as string | undefined;
    if (trip_id) {
      const { data: trip } = await supa.from('trips').select('category_slug, driver_id').eq('id', trip_id).maybeSingle();
      if (!trip) throw new HttpError(404, 'Trip not found');
      if (trip.driver_id !== user.id) throw new HttpError(403, 'Not your trip');
      category = trip.category_slug;
    }
    if (!category) throw new HttpError(400, 'category or trip_id required');

    // Signals
    let isNewDevice = false;
    if (device_id) {
      const { data: dev } = await supa.from('driver_devices').select('device_id')
        .eq('driver_id', user.id).eq('device_id', device_id).maybeSingle();
      isNewDevice = !dev;
    }
    const { data: recentFails } = await supa.from('verification_events')
      .select('id').eq('driver_id', user.id).eq('result', 'failed')
      .gte('created_at', new Date(Date.now() - RECENT_FAILURE_WINDOW_MS).toISOString());
    const hadRecentFailure = (recentFails?.length ?? 0) > 0;

    const verdict = assessIdentityRisk({
      category: category as never,
      lastVerifiedAt: dp.last_verified_at,
      isNewDevice,
      hadRecentFailure,
      tripsCompleted: dp.trips_completed ?? 0,
    });

    if (action === 'assess') {
      return json({
        action: verdict.action,
        message: verdict.action === 'pass' ? null : explainChallenge(verdict),
        fail_closed: verdict.failClosed,
        category_risk: verdict.categoryRisk,
      });
    }

    if (action !== 'submit') throw new HttpError(400, `Unknown action: ${action}`);

    const selfie = body.selfie_base64;
    if (!selfie) throw new HttpError(400, 'selfie_base64 required');

    const { matchScore, livenessPassed } = await mockMatch(selfie);
    const passed = livenessPassed && matchScore >= MATCH_THRESHOLD;

    // Keep the selfie as evidence for the audit trail / disputes.
    let selfiePath: string | null = null;
    try {
      const bytes = Uint8Array.from(atob(selfie), (ch) => ch.charCodeAt(0));
      selfiePath = `${user.id}/verify/${Date.now()}.jpg`;
      await supa.storage.from('documents').upload(selfiePath, bytes, { contentType: 'image/jpeg', upsert: true });
    } catch (_e) {
      selfiePath = null; // evidence is best-effort; never block on storage
    }

    await supa.from('verification_events').insert({
      driver_id: user.id,
      trip_id: trip_id ?? null,
      kind: trip_id ? 'trip_start' : 'random',
      result: passed ? 'passed' : 'failed',
      risk_score: verdict.score,
      risk_reasons: verdict.reasons,
      match_score: matchScore,
      liveness_passed: livenessPassed,
      selfie_path: selfiePath,
      device_id: device_id ?? null,
      category_slug: category,
      fail_closed: verdict.failClosed,
    });

    if (passed) {
      await supa.from('driver_profiles').update({ last_verified_at: new Date().toISOString() }).eq('driver_id', user.id);
      if (device_id) {
        await supa.from('driver_devices').upsert(
          { driver_id: user.id, device_id, last_seen_at: new Date().toISOString() },
          { onConflict: 'driver_id,device_id' },
        );
      }
      return json({ ok: true, passed: true });
    }

    // Repeated failures put the account on hold for human review.
    const { data: fails } = await supa.from('verification_events')
      .select('id').eq('driver_id', user.id).eq('result', 'failed')
      .gte('created_at', new Date(Date.now() - RECENT_FAILURE_WINDOW_MS).toISOString());
    if ((fails?.length ?? 0) >= FAILURES_BEFORE_HOLD) {
      await supa.from('driver_profiles').update({
        identity_hold: true,
        identity_hold_reason: 'Multiple face checks did not match. Contact support to restore your account.',
      }).eq('driver_id', user.id);
      await supa.from('driver_presence').update({ status: 'offline' }).eq('driver_id', user.id);
      return json({ ok: false, passed: false, held: true, message: 'Too many failed checks — your account is on hold.' });
    }

    return json({
      ok: false,
      passed: false,
      message: livenessPassed ? 'That didn’t match your registered photo. Try again in good light.' : 'Liveness check failed — look straight at the camera and try again.',
    });
  } catch (e) {
    return errorResponse(e);
  }
});

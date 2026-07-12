import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { supabase, callFn } from '@/lib/supabase';
import { colors, ui } from '@/lib/ui';

type DriverProfile = {
  status: string;
  rejection_reason: string | null;
  license_classes: string[];
  trips_completed: number;
  rating_avg: number | null;
};
type Trip = {
  id: string;
  status: string;
  trip_type: string;
  category_slug: string;
  pickup_address: string | null;
  destination_address: string | null;
  payment_mode: string;
  payment_status: string;
  fare_total: number | null;
  distance_km: number | null;
  customer_id: string;
  days: number | null;
};
type Offer = { id: string; trip_id: string; distance_km: number | null; expires_at: string };
type Fee = { amount_inr: number; status: string; due_at: string };

const LOCATION_PING_MS = 5000; // PRD §4.1: 4–10 s adaptive

export default function DriverHome() {
  const [uid, setUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [presence, setPresence] = useState<'offline' | 'online' | 'busy'>('offline');
  const [offer, setOffer] = useState<Offer | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [fee, setFee] = useState<Fee | null>(null);
  const [otpInput, setOtpInput] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (userId: string) => {
    const [{ data: dp }, { data: pr }, { data: sf }, { data: activeTrip }] = await Promise.all([
      supabase.from('driver_profiles')
        .select('status, rejection_reason, license_classes, trips_completed, rating_avg')
        .eq('driver_id', userId).maybeSingle(),
      supabase.from('driver_presence').select('status').eq('driver_id', userId).maybeSingle(),
      supabase.from('setup_fees').select('amount_inr, status, due_at').eq('driver_id', userId).maybeSingle(),
      supabase.from('trips').select('*').eq('driver_id', userId)
        .in('status', ['accepted', 'driver_arrived', 'in_progress', 'completed', 'paid'])
        .order('requested_at', { ascending: false }).limit(1).maybeSingle(),
    ]);
    setProfile(dp as DriverProfile | null);
    setPresence(((pr?.status as typeof presence) ?? 'offline'));
    setFee(sf?.status === 'pending' ? (sf as Fee) : null);
    setTrip(activeTrip as Trip | null);
    if (!activeTrip) {
      const { data: offers } = await supabase.from('trip_requests')
        .select('id, trip_id, distance_km, expires_at')
        .eq('driver_id', userId).eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false }).limit(1);
      setOffer((offers?.[0] as Offer) ?? null);
    } else {
      setOffer(null);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      setUid(data.session.user.id);
      refresh(data.session.user.id);
    });
  }, [refresh]);

  // Realtime: new offers and trip updates for this driver
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel('driver-home')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_requests', filter: `driver_id=eq.${uid}` }, () => refresh(uid))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `driver_id=eq.${uid}` }, () => refresh(uid))
      .subscribe();
    const poll = setInterval(() => refresh(uid), 8000); // realtime fallback
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [uid, refresh]);

  // Offer countdown
  useEffect(() => {
    if (!offer) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 1000));
      setCountdown(left);
      if (left === 0) setOffer(null);
    }, 500);
    return () => clearInterval(iv);
  }, [offer]);

  // GPS streaming while online/busy
  useEffect(() => {
    if (presence === 'offline') {
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = null;
      return;
    }
    async function ping() {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await supabase.rpc('set_driver_location', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude });
      } catch {
        // ignore transient GPS errors; server marks us stale
      }
    }
    ping();
    pingRef.current = setInterval(ping, LOCATION_PING_MS);
    return () => {
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [presence]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (uid) await refresh(uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleOnline() {
    await act(async () => {
      if (presence === 'offline') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') throw new Error('Location permission is required to go online');
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { error } = await supabase.rpc('go_online', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.rpc('go_offline');
        if (error) throw new Error(error.message);
      }
    });
  }

  if (!profile) {
    return (
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <Text style={ui.muted}>Loading…</Text>
      </View>
    );
  }

  // ── Verification gate ────────────────────────────────────────────────
  if (profile.status !== 'approved') {
    return (
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <View style={ui.card}>
          <Text style={ui.h2}>
            {profile.status === 'draft' && 'Finish your registration'}
            {['submitted', 'under_review'].includes(profile.status) && 'Profile under review'}
            {profile.status === 'rejected' && 'Profile rejected'}
            {profile.status === 'suspended' && 'Account suspended'}
          </Text>
          <Text style={ui.muted}>
            {profile.status === 'draft' && 'Complete identity, license and police verification to start driving.'}
            {['submitted', 'under_review'].includes(profile.status) &&
              'Our team is reviewing your documents. You will be able to go online once approved.'}
            {profile.status === 'rejected' && (profile.rejection_reason ?? 'Contact support for details.')}
            {profile.status === 'suspended' && (profile.rejection_reason ?? 'Contact support for details.')}
          </Text>
          {['draft', 'rejected'].includes(profile.status) && (
            <TouchableOpacity style={[ui.btn, { marginTop: 16 }]} onPress={() => router.push('/register')}>
              <Text style={ui.btnText}>{profile.status === 'draft' ? 'Start registration' : 'Fix and resubmit'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const feeOverdue = fee && new Date(fee.due_at) < new Date();

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h1}>Halting Driver</Text>
      <Text style={[ui.muted, { marginBottom: 16 }]}>
        {profile.trips_completed} trips · ★ {profile.rating_avg ?? '—'} · {profile.license_classes.join(', ')}
      </Text>

      {fee && (
        <View style={[ui.card, { borderLeftWidth: 4, borderLeftColor: feeOverdue ? colors.red : colors.amber }]}>
          <Text style={ui.h2}>₹{fee.amount_inr} setup fee due</Text>
          <Text style={ui.muted}>
            One-time platform fee after your first trip. Due {new Date(fee.due_at).toLocaleString()}.
            {feeOverdue ? ' You cannot go online until it is paid.' : ''}
          </Text>
          <TouchableOpacity
            style={[ui.btn, ui.btnGreen, { marginTop: 12 }]}
            disabled={busy}
            onPress={() => act(() => callFn('trip-lifecycle', { action: 'pay_setup_fee' }))}
          >
            <Text style={ui.btnText}>Pay now (mock UPI)</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && <Text style={ui.error}>{error}</Text>}

      {/* ── Go Online / Offline ── */}
      {!trip && (
        <View style={ui.card}>
          <Text style={ui.h2}>{presence === 'offline' ? 'You are offline' : presence === 'busy' ? 'On a trip' : 'You are online'}</Text>
          <Text style={ui.muted}>
            {presence === 'offline'
              ? 'Go online to receive trip requests from nearby customers.'
              : 'Customers nearby can see you. Location is shared every few seconds.'}
          </Text>
          {presence !== 'busy' && (
            <TouchableOpacity
              style={[ui.btn, presence === 'offline' ? ui.btnGreen : ui.btnRed, { marginTop: 16 }]}
              disabled={busy}
              onPress={toggleOnline}
            >
              <Text style={ui.btnText}>{presence === 'offline' ? 'GO ONLINE' : 'GO OFFLINE'}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Incoming request ── */}
      {offer && !trip && (
        <View style={[ui.card, { borderWidth: 2, borderColor: colors.green }]}>
          <Text style={ui.h2}>New trip request · {countdown}s</Text>
          <Text style={ui.muted}>Pickup ≈ {offer.distance_km ?? '?'} km away</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity
              style={[ui.btn, ui.btnGreen, { flex: 1 }]}
              disabled={busy}
              onPress={() => act(() => callFn('trip-lifecycle', { action: 'accept', trip_id: offer.trip_id }))}
            >
              <Text style={ui.btnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[ui.btn, ui.btnRed, { flex: 1 }]}
              disabled={busy}
              onPress={() => act(() => callFn('trip-lifecycle', { action: 'decline', trip_id: offer.trip_id }))}
            >
              <Text style={ui.btnText}>Decline</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Active trip ── */}
      {trip && (
        <View style={ui.card}>
          <Text style={ui.h2}>Trip · {trip.status.replaceAll('_', ' ')}</Text>
          <Text style={ui.muted}>
            {trip.category_slug} · {trip.trip_type === 'per_km' ? 'per-km trip' : `${trip.days} day(s) hire`} · pay by {trip.payment_mode}
          </Text>
          <Text style={[ui.muted, { marginTop: 4 }]}>
            {trip.pickup_address ?? 'Pickup'} {trip.destination_address ? `→ ${trip.destination_address}` : ''}
          </Text>

          {trip.status === 'accepted' && (
            <TouchableOpacity style={[ui.btn, { marginTop: 16 }]} disabled={busy}
              onPress={() => act(() => callFn('trip-lifecycle', { action: 'arrive', trip_id: trip.id }))}>
              <Text style={ui.btnText}>I have arrived</Text>
            </TouchableOpacity>
          )}

          {trip.status === 'driver_arrived' && (
            <>
              <Text style={[ui.muted, { marginTop: 12 }]}>Ask the customer for the 4-digit start OTP:</Text>
              <TextInput style={[ui.input, { marginTop: 8, letterSpacing: 8, textAlign: 'center', fontSize: 24 }]}
                keyboardType="number-pad" maxLength={4} value={otpInput} onChangeText={setOtpInput} placeholder="••••" />
              <TouchableOpacity style={[ui.btn, ui.btnGreen]} disabled={busy || otpInput.length !== 4}
                onPress={() => act(async () => {
                  await callFn('trip-lifecycle', { action: 'start', trip_id: trip.id, otp: otpInput });
                  setOtpInput('');
                })}>
                <Text style={ui.btnText}>Start trip</Text>
              </TouchableOpacity>
            </>
          )}

          {trip.status === 'in_progress' && (
            <TouchableOpacity style={[ui.btn, ui.btnRed, { marginTop: 16 }]} disabled={busy}
              onPress={() =>
                Alert.alert('End trip?', 'Fare will be calculated from the recorded distance/time.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'End trip', style: 'destructive', onPress: () => act(() => callFn('trip-lifecycle', { action: 'end', trip_id: trip.id })) },
                ])
              }>
              <Text style={ui.btnText}>END TRIP</Text>
            </TouchableOpacity>
          )}

          {trip.status === 'completed' && (
            <>
              <Text style={[ui.h2, { marginTop: 12 }]}>Fare: ₹{trip.fare_total ?? '…'}</Text>
              {trip.distance_km != null && <Text style={ui.muted}>{trip.distance_km} km</Text>}
              {trip.payment_mode === 'cash' && trip.payment_status === 'pending' && (
                <TouchableOpacity style={[ui.btn, ui.btnGreen, { marginTop: 12 }]} disabled={busy}
                  onPress={() => act(() => callFn('trip-lifecycle', { action: 'cash_collected', trip_id: trip.id }))}>
                  <Text style={ui.btnText}>Cash collected</Text>
                </TouchableOpacity>
              )}
              {trip.payment_status === 'collected_claimed' && (
                <Text style={[ui.muted, { marginTop: 12 }]}>Waiting for customer to confirm payment…</Text>
              )}
              {trip.payment_mode === 'in_app' && trip.payment_status === 'pending' && (
                <Text style={[ui.muted, { marginTop: 12 }]}>Waiting for in-app payment…</Text>
              )}
            </>
          )}

          {trip.status === 'paid' && (
            <TouchableOpacity style={[ui.btn, { marginTop: 16 }]} disabled={busy}
              onPress={() => act(() => callFn('trip-lifecycle', { action: 'close', trip_id: trip.id }))}>
              <Text style={ui.btnText}>Close trip</Text>
            </TouchableOpacity>
          )}

          {['accepted', 'driver_arrived'].includes(trip.status) && (
            <TouchableOpacity style={{ marginTop: 12 }} disabled={busy}
              onPress={() => act(() => callFn('trip-lifecycle', { action: 'cancel', trip_id: trip.id }))}>
              <Text style={{ color: colors.red, textAlign: 'center' }}>Cancel trip</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        onPress={async () => {
          await supabase.auth.signOut();
          router.replace('/login');
        }}
        style={{ marginTop: 24 }}
      >
        <Text style={{ color: colors.muted, textAlign: 'center' }}>Sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

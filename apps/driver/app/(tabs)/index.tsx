import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase, callFn } from '@/lib/supabase';
import { c, money, r, s, shadow, type as t } from '@/lib/theme';
import { Avatar, Badge, Button, Card, Divider, IconChip, SectionTitle, StatTile } from '@/lib/components';

type Trip = {
  id: string; status: string; trip_type: string; category_slug: string;
  pickup_address: string | null; destination_address: string | null;
  payment_mode: string; payment_status: string; fare_total: number | null;
  distance_km: number | null; customer_id: string; days: number | null; closed_at: string | null;
};
type Offer = { id: string; trip_id: string; distance_km: number | null; expires_at: string };
type Fee = { amount_inr: number; status: string; due_at: string };

const LOCATION_PING_MS = 5000;

const CATEGORY: Record<string, { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }> = {
  car: { icon: 'car', label: 'Car' }, tractor: { icon: 'tractor', label: 'Tractor' },
  truck: { icon: 'truck', label: 'Truck' }, bus: { icon: 'bus', label: 'Bus' },
  school_bus: { icon: 'bus-school', label: 'School Bus' }, crane: { icon: 'crane', label: 'Crane' },
  earth_mover: { icon: 'excavator', label: 'Earth Mover' },
};
const cat = (slug: string) => CATEGORY[slug] ?? { icon: 'steering' as const, label: slug };

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const dayKey = (iso: string | null) => (iso ? new Date(iso).toDateString() : '');
const todayKey = new Date().toDateString();
const yesterdayKey = new Date(Date.now() - 864e5).toDateString();

export default function Home() {
  const insets = useSafeAreaInsets();
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState('Driver');
  const [rating, setRating] = useState<number | null>(null);
  const [lifetime, setLifetime] = useState(0);
  const [licenceClasses, setLicenceClasses] = useState<string[]>([]);
  const [presence, setPresence] = useState<'offline' | 'online' | 'busy'>('offline');
  const [offer, setOffer] = useState<Offer | null>(null);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [fee, setFee] = useState<Fee | null>(null);
  const [recent, setRecent] = useState<Trip[]>([]);
  const [otpInput, setOtpInput] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async (userId: string) => {
    const [{ data: dp }, { data: pr }, { data: sf }, { data: activeTrip }, { data: closed }] = await Promise.all([
      supabase.from('driver_profiles').select('license_classes, trips_completed, rating_avg').eq('driver_id', userId).maybeSingle(),
      supabase.from('driver_presence').select('status').eq('driver_id', userId).maybeSingle(),
      supabase.from('setup_fees').select('amount_inr, status, due_at').eq('driver_id', userId).maybeSingle(),
      supabase.from('trips').select('*').eq('driver_id', userId).in('status', ['accepted', 'driver_arrived', 'in_progress', 'completed', 'paid']).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('trips').select('id, category_slug, trip_type, fare_total, closed_at, distance_km, days, status, pickup_address, destination_address, payment_mode, payment_status, customer_id').eq('driver_id', userId).eq('status', 'closed').order('closed_at', { ascending: false }).limit(30),
    ]);
    if (dp) { setRating(dp.rating_avg); setLifetime(dp.trips_completed); setLicenceClasses(dp.license_classes ?? []); }
    setPresence(((pr?.status as typeof presence) ?? 'offline'));
    setFee(sf?.status === 'pending' ? (sf as Fee) : null);
    setTrip(activeTrip as Trip | null);
    setRecent((closed as Trip[]) ?? []);
    if (!activeTrip) {
      const { data: offers } = await supabase.from('trip_requests').select('id, trip_id, distance_km, expires_at').eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
      setOffer((offers?.[0] as Offer) ?? null);
    } else setOffer(null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.replace('/login');
      setUid(data.session.user.id);
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', data.session.user.id).maybeSingle();
      if (p?.full_name) setName(p.full_name);
      refresh(data.session.user.id);
    });
  }, [refresh]);

  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel('driver-home')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trip_requests', filter: `driver_id=eq.${uid}` }, () => refresh(uid))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `driver_id=eq.${uid}` }, () => refresh(uid))
      .subscribe();
    const poll = setInterval(() => refresh(uid), 8000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [uid, refresh]);

  useEffect(() => {
    if (!offer) return;
    const iv = setInterval(() => {
      const left = Math.max(0, Math.round((new Date(offer.expires_at).getTime() - Date.now()) / 1000));
      setCountdown(left);
      if (left === 0) setOffer(null);
    }, 500);
    return () => clearInterval(iv);
  }, [offer]);

  useEffect(() => {
    if (presence === 'offline') { if (pingRef.current) clearInterval(pingRef.current); pingRef.current = null; return; }
    async function ping() {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await supabase.rpc('set_driver_location', { p_lat: pos.coords.latitude, p_lng: pos.coords.longitude });
      } catch { /* ignore */ }
    }
    ping();
    pingRef.current = setInterval(ping, LOCATION_PING_MS);
    return () => { if (pingRef.current) clearInterval(pingRef.current); };
  }, [presence]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await fn(); if (uid) await refresh(uid); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(false); }
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

  const online = presence !== 'offline';
  const todayTrips = recent.filter((x) => dayKey(x.closed_at) === todayKey);
  const yTrips = recent.filter((x) => dayKey(x.closed_at) === yesterdayKey);
  const todayEarnings = todayTrips.reduce((a, x) => a + (x.fare_total ?? 0), 0);
  const yEarnings = yTrips.reduce((a, x) => a + (x.fare_total ?? 0), 0);
  const feeOverdue = fee && new Date(fee.due_at) < new Date();

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + s.md, padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
        <Avatar name={name} />
        <View style={{ flex: 1 }}>
          <Text style={[t.small, { color: c.inkFaint }]}>{greeting()},</Text>
          <Text style={[t.h2, { color: c.ink }]} numberOfLines={1}>{name}</Text>
        </View>
        <Badge label={rating ? rating.toFixed(1) : 'New'} tone="warn" icon="star" />
      </View>

      {fee && (
        <Card style={{ borderWidth: 1, borderColor: feeOverdue ? c.danger : c.warn }}>
          <View style={{ flexDirection: 'row', gap: s.md }}>
            <IconChip icon="card-outline" tint={feeOverdue ? c.danger : c.warn} />
            <View style={{ flex: 1 }}>
              <Text style={[t.h3, { color: c.ink }]}>{money(fee.amount_inr)} setup fee due</Text>
              <Text style={[t.small, { color: c.inkMuted, marginTop: 2 }]}>{feeOverdue ? 'Overdue — clear it to go online again.' : `Due ${new Date(fee.due_at).toLocaleDateString()}.`}</Text>
            </View>
          </View>
          <Button label="Pay now" icon="flash" variant="success" onPress={() => act(() => callFn('trip-lifecycle', { action: 'pay_setup_fee' }))} loading={busy} style={{ marginTop: s.md }} />
        </Card>
      )}

      {error && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.md }}>
          <Ionicons name="alert-circle" size={18} color={c.danger} />
          <Text style={{ color: c.danger, flex: 1, fontWeight: '600' }}>{error}</Text>
        </View>
      )}

      {offer && !trip && (
        <View style={[{ backgroundColor: c.ink, borderRadius: r.xl, padding: s.xl }, shadow.hero]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: c.onInk, fontSize: 18, fontWeight: '800' }}>New trip request</Text>
            <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: c.online, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: c.onInk, fontWeight: '800' }}>{countdown}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, marginTop: s.md }}>
            <Ionicons name="location" size={16} color={c.online} />
            <Text style={{ color: 'rgba(255,255,255,0.8)' }}>Pickup approximately {offer.distance_km ?? '?'} km away</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: s.md, marginTop: s.lg }}>
            <Button label="Decline" variant="ghost" onPress={() => act(() => callFn('trip-lifecycle', { action: 'decline', trip_id: offer.trip_id }))} loading={busy} style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 0 }} />
            <Button label="Accept" variant="success" icon="checkmark" onPress={() => act(() => callFn('trip-lifecycle', { action: 'accept', trip_id: offer.trip_id }))} loading={busy} style={{ flex: 1.4 }} />
          </View>
        </View>
      )}

      {trip ? (
        <ActiveTrip trip={trip} busy={busy} otpInput={otpInput} setOtpInput={setOtpInput} act={act} />
      ) : (
        !offer && (
          <>
            <View style={[{ backgroundColor: online ? c.ink : c.surface, borderRadius: r.xl, padding: s.xl }, shadow.hero]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: online ? c.online : c.inkFaint }} />
                <Text style={{ color: online ? c.onInk : c.ink, fontSize: 20, fontWeight: '800' }}>{presence === 'busy' ? 'On a trip' : online ? "You're online" : "You're offline"}</Text>
              </View>
              <Text style={{ color: online ? 'rgba(255,255,255,0.72)' : c.inkMuted, marginTop: 6, lineHeight: 20 }}>{online ? 'Nearby customers can see you. Sharing your location.' : 'Go online to start receiving trip requests near you.'}</Text>
              {presence !== 'busy' && <Button label={online ? 'Go offline' : 'Go online'} icon={online ? 'power' : 'flash'} variant={online ? 'danger' : 'success'} onPress={toggleOnline} loading={busy} style={{ marginTop: s.lg }} />}
            </View>

            {/* Yesterday's disbursement / latest report */}
            <Card>
              <SectionTitle title="Yesterday's disbursement" action={<Pressable onPress={() => router.push('/activity')}><Text style={{ color: c.brand, fontWeight: '700', fontSize: 13 }}>View all</Text></Pressable>} />
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ fontSize: 34, fontWeight: '800', color: c.ink }}>{money(yEarnings)}</Text>
                  <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2 }}>{yTrips.length} trip{yTrips.length === 1 ? '' : 's'} · {yesterdayKey.replace(/^\w+ /, '')}</Text>
                </View>
                <Badge label={yEarnings > 0 ? 'Settled T+1' : 'No trips'} tone={yEarnings > 0 ? 'online' : 'neutral'} icon={yEarnings > 0 ? 'checkmark-circle' : undefined} />
              </View>
            </Card>

            <Card>
              <SectionTitle title="Today" action={<Badge label={online ? 'Live' : 'Idle'} tone={online ? 'online' : 'neutral'} />} />
              <View style={{ flexDirection: 'row', gap: s.md }}>
                <StatTile icon="cash-outline" tint={c.online} value={money(todayEarnings)} label="Earnings" />
                <StatTile icon="navigate-outline" tint={c.brand} value={String(todayTrips.length)} label="Trips" />
                <StatTile icon="star-outline" tint={c.gold} value={rating ? rating.toFixed(1) : '—'} label="Rating" />
              </View>
              <Divider />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
                <Ionicons name="ribbon-outline" size={16} color={c.inkMuted} />
                <Text style={{ color: c.inkMuted, fontSize: 13 }}>{lifetime} lifetime trips · Licence {licenceClasses.join(', ')}</Text>
              </View>
            </Card>

            {recent.length > 0 && (
              <View>
                <SectionTitle title="Recent trips" action={<Pressable onPress={() => router.push('/activity')}><Text style={{ color: c.brand, fontWeight: '700', fontSize: 13 }}>See all</Text></Pressable>} />
                <Card style={{ padding: s.xs }}>
                  {recent.slice(0, 3).map((tr, i, arr) => {
                    const m = cat(tr.category_slug);
                    return (
                      <View key={tr.id}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md, padding: s.md }}>
                          <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name={m.icon} size={22} color={c.ink} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>{m.label}</Text>
                            <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2 }}>{tr.closed_at ? new Date(tr.closed_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}{tr.distance_km ? ` · ${tr.distance_km} km` : ''}</Text>
                          </View>
                          <Text style={{ color: c.ink, fontWeight: '800', fontSize: 15 }}>{money(tr.fare_total)}</Text>
                        </View>
                        {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: c.border, marginLeft: 70 }} />}
                      </View>
                    );
                  })}
                </Card>
              </View>
            )}
          </>
        )
      )}
    </ScrollView>
  );
}

function ActiveTrip({ trip, busy, otpInput, setOtpInput, act }: { trip: Trip; busy: boolean; otpInput: string; setOtpInput: (v: string) => void; act: (fn: () => Promise<unknown>) => Promise<void>; }) {
  const m = cat(trip.category_slug);
  const steps = ['accepted', 'driver_arrived', 'in_progress', 'completed'];
  const activeIdx = Math.max(0, steps.indexOf(trip.status === 'paid' ? 'completed' : trip.status));
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name={m.icon} size={24} color={c.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[t.h2, { color: c.ink }]}>{m.label} trip</Text>
          <Text style={{ color: c.inkMuted, fontSize: 13 }}>{trip.trip_type === 'per_km' ? 'Per-km fare' : `${trip.days} day hire`} · pay by {trip.payment_mode === 'cash' ? 'cash' : 'in-app'}</Text>
        </View>
        <Badge label={trip.status.replaceAll('_', ' ')} tone="brand" />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: s.lg }}>
        {steps.map((_, i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= activeIdx ? c.online : c.border }} />)}
      </View>
      <View style={{ marginTop: s.lg, gap: s.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
          <Ionicons name="ellipse" size={10} color={c.online} />
          <Text style={{ color: c.ink, flex: 1 }} numberOfLines={1}>{trip.pickup_address ?? 'Pickup location'}</Text>
        </View>
        {trip.destination_address && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Ionicons name="location" size={12} color={c.danger} />
            <Text style={{ color: c.ink, flex: 1 }} numberOfLines={1}>{trip.destination_address}</Text>
          </View>
        )}
      </View>
      <Divider />
      {trip.status === 'accepted' && <Button label="I've arrived at pickup" icon="checkmark-done" onPress={() => act(() => callFn('trip-lifecycle', { action: 'arrive', trip_id: trip.id }))} loading={busy} />}
      {trip.status === 'driver_arrived' && (
        <View style={{ gap: s.md }}>
          <Text style={{ color: c.inkMuted, fontSize: 13 }}>Ask the customer for their 4-digit start code:</Text>
          <TextInput value={otpInput} onChangeText={setOtpInput} keyboardType="number-pad" maxLength={4} placeholder="––––" placeholderTextColor={c.inkFaint} style={{ borderWidth: 1.5, borderColor: c.border, borderRadius: r.md, textAlign: 'center', fontSize: 28, letterSpacing: 14, paddingVertical: s.md, color: c.ink, fontWeight: '800' }} />
          <Button label="Start trip" icon="play" variant="success" disabled={otpInput.length !== 4} loading={busy} onPress={() => act(async () => { await callFn('trip-lifecycle', { action: 'start', trip_id: trip.id, otp: otpInput }); setOtpInput(''); })} />
        </View>
      )}
      {trip.status === 'in_progress' && <Button label="End trip" icon="stop" variant="danger" loading={busy} onPress={() => Alert.alert('End trip?', 'The fare is calculated from the distance travelled.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End trip', style: 'destructive', onPress: () => act(() => callFn('trip-lifecycle', { action: 'end', trip_id: trip.id })) }])} />}
      {trip.status === 'completed' && (
        <View style={{ gap: s.md }}>
          <View style={{ backgroundColor: c.surfaceAlt, borderRadius: r.md, padding: s.lg, alignItems: 'center' }}>
            <Text style={{ color: c.inkMuted, fontSize: 13 }}>Fare {trip.distance_km ? `· ${trip.distance_km} km` : ''}</Text>
            <Text style={{ color: c.ink, fontSize: 34, fontWeight: '800', marginTop: 2 }}>{money(trip.fare_total)}</Text>
          </View>
          {trip.payment_mode === 'cash' && trip.payment_status === 'pending' && <Button label="Cash collected" icon="cash" variant="success" loading={busy} onPress={() => act(() => callFn('trip-lifecycle', { action: 'cash_collected', trip_id: trip.id }))} />}
          {trip.payment_status === 'collected_claimed' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s.sm }}><Ionicons name="time-outline" size={16} color={c.inkMuted} /><Text style={{ color: c.inkMuted }}>Waiting for customer to confirm…</Text></View>}
          {trip.payment_mode === 'in_app' && trip.payment_status === 'pending' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s.sm }}><Ionicons name="time-outline" size={16} color={c.inkMuted} /><Text style={{ color: c.inkMuted }}>Waiting for in-app payment…</Text></View>}
        </View>
      )}
      {trip.status === 'paid' && <Button label="Close trip" icon="checkmark-circle" loading={busy} onPress={() => act(() => callFn('trip-lifecycle', { action: 'close', trip_id: trip.id }))} />}
      {['accepted', 'driver_arrived'].includes(trip.status) && <Pressable onPress={() => act(() => callFn('trip-lifecycle', { action: 'cancel', trip_id: trip.id }))} style={{ paddingTop: s.md }}><Text style={{ color: c.danger, textAlign: 'center', fontWeight: '600' }}>Cancel trip</Text></Pressable>}
    </Card>
  );
}

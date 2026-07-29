import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { calculateFare, haversineKm } from '@acting/shared';
import { supabase, callFn } from '@/lib/supabase';
import { MAP_STYLE } from '@/lib/mapStyle';
import { c, money, r, s, shadow, type as t } from '@/lib/theme';
import { Avatar, Badge, Button } from '@/lib/components';

const CHENNAI = { latitude: 13.0827, longitude: 80.2707, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const LOCATION_PING_MS = 5000;

type Trip = { id: string; status: string; trip_type: string; category_slug: string; pickup_address: string | null; destination_address: string | null; payment_mode: string; payment_status: string; fare_total: number | null; distance_km: number | null; customer_id: string; days: number | null; closed_at: string | null; };
type Offer = { id: string; trip_id: string; distance_km: number | null; expires_at: string };
type OfferDetail = { categoryLabel: string; catIcon: keyof typeof MaterialCommunityIcons.glyphMap; tripType: string; pickupAddr: string; destAddr: string | null; customerName: string; verified: boolean; estFare: number | null; rate: string };
type Fee = { amount_inr: number; status: string; due_at: string };
type Geo = { coordinates: [number, number] } | null;

const CATEGORY: Record<string, { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }> = {
  car: { icon: 'car', label: 'Car' }, tractor: { icon: 'tractor', label: 'Tractor' }, truck: { icon: 'truck', label: 'Truck' },
  bus: { icon: 'bus', label: 'Bus' }, school_bus: { icon: 'bus-school', label: 'School Bus' }, crane: { icon: 'crane', label: 'Crane' }, earth_mover: { icon: 'excavator', label: 'Earth Mover' },
};
const cat = (slug: string) => CATEGORY[slug] ?? { icon: 'steering' as const, label: slug };
const dayKey = (iso: string | null) => (iso ? new Date(iso).toDateString() : '');
const todayKey = new Date().toDateString();

export default function Home() {
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);
  const [region, setRegion] = useState(CHENNAI);
  const [meLoc, setMeLoc] = useState<{ latitude: number; longitude: number } | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState('Driver');
  const [photo, setPhoto] = useState<string | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [presence, setPresence] = useState<'offline' | 'online' | 'busy'>('offline');
  const [offer, setOffer] = useState<Offer | null>(null);
  const [detail, setDetail] = useState<OfferDetail | null>(null);
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
      supabase.from('driver_profiles').select('trips_completed, rating_avg').eq('driver_id', userId).maybeSingle(),
      supabase.from('driver_presence').select('status').eq('driver_id', userId).maybeSingle(),
      supabase.from('setup_fees').select('amount_inr, status, due_at').eq('driver_id', userId).maybeSingle(),
      supabase.from('trips').select('*').eq('driver_id', userId).in('status', ['accepted', 'driver_arrived', 'in_progress', 'completed', 'paid']).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('trips').select('id, fare_total, closed_at, category_slug').eq('driver_id', userId).eq('status', 'closed').order('closed_at', { ascending: false }).limit(30),
    ]);
    if (dp) setRating(dp.rating_avg);
    setPresence(((pr?.status as typeof presence) ?? 'offline'));
    setFee(sf?.status === 'pending' && new Date(sf.due_at) < new Date() ? (sf as Fee) : null);
    setTrip(activeTrip as Trip | null);
    setRecent((closed as Trip[]) ?? []);
    if (!activeTrip) {
      const { data: offers } = await supabase.from('trip_requests').select('id, trip_id, distance_km, expires_at').eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
      setOffer((offers?.[0] as Offer) ?? null);
    } else setOffer(null);
  }, []);

  // fetch rich detail for an incoming offer (customer, category, est. fare)
  useEffect(() => {
    if (!offer || !uid) { setDetail(null); return; }
    (async () => {
      const { data: tr } = await supabase.from('trips').select('category_slug, trip_type, days, pickup_location, destination_location, pickup_address, destination_address, customer_id').eq('id', offer.trip_id).maybeSingle();
      if (!tr) return;
      const [{ data: cust }, { data: dc }] = await Promise.all([
        supabase.from('profiles').select('full_name, kyc_verified_at').eq('id', tr.customer_id).maybeSingle(),
        supabase.from('driver_categories').select('price_per_km, price_per_day, overtime_per_hour').eq('driver_id', uid).eq('category_slug', tr.category_slug).maybeSingle(),
      ]);
      const m = cat(tr.category_slug);
      let estFare: number | null = null;
      let rate = '';
      try {
        if (tr.trip_type === 'per_km' && dc?.price_per_km) {
          const p = tr.pickup_location as Geo, d = tr.destination_location as Geo;
          const km = p?.coordinates && d?.coordinates ? haversineKm({ lat: p.coordinates[1], lng: p.coordinates[0] }, { lat: d.coordinates[1], lng: d.coordinates[0] }) : 0;
          estFare = calculateFare({ tripType: 'per_km', distanceKm: km, pricing: { pricePerKm: Number(dc.price_per_km), pricePerDay: null, overtimePerHour: null } }).total;
          rate = `₹${dc.price_per_km}/km`;
        } else if (dc?.price_per_day) {
          estFare = calculateFare({ tripType: 'per_day', days: tr.days ?? 1, pricing: { pricePerKm: null, pricePerDay: Number(dc.price_per_day), overtimePerHour: null } }).total;
          rate = `₹${dc.price_per_day}/day`;
        }
      } catch { /* est optional */ }
      setDetail({ categoryLabel: m.label, catIcon: m.icon, tripType: tr.trip_type, pickupAddr: tr.pickup_address ?? 'Pickup', destAddr: tr.destination_address, customerName: cust?.full_name ?? 'Customer', verified: !!cust?.kyc_verified_at, estFare, rate });
    })();
  }, [offer, uid]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return router.replace('/login');
      setUid(data.session.user.id);
      const { data: p } = await supabase.from('profiles').select('full_name, photo_url').eq('id', data.session.user.id).maybeSingle();
      if (p?.full_name) setName(p.full_name);
      setPhoto(p?.photo_url ?? null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          const here = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setMeLoc(here);
          setRegion({ ...here, latitudeDelta: 0.03, longitudeDelta: 0.03 });
        } catch { /* keep default */ }
      }
      refresh(data.session.user.id);
    })();
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
        setMeLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
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
        setMeLoc({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        mapRef.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 500);
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
  const todayEarnings = todayTrips.reduce((a, x) => a + (x.fare_total ?? 0), 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={MAP_STYLE as any}
        initialRegion={CHENNAI}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {trip && meLoc && <Marker coordinate={meLoc} anchor={{ x: 0.5, y: 0.5 }}><View style={mapStyles.mePin}><MaterialCommunityIcons name={cat(trip.category_slug).icon} size={16} color={c.onInk} /></View></Marker>}
      </MapView>

      {/* Floating top bar */}
      <View style={{ position: 'absolute', top: insets.top + s.sm, left: s.md, right: s.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => router.push('/account')} style={[mapStyles.fab, { padding: 0, overflow: 'hidden' }]}>
          <Avatar name={name} uri={photo} size={44} />
        </Pressable>
        <View style={[mapStyles.pill, shadow.card]}>
          <Ionicons name="trending-up" size={16} color={c.online} />
          <Text style={{ fontWeight: '700', fontSize: 14, color: c.ink }}>{money(todayEarnings)} today</Text>
        </View>
        <View style={[mapStyles.fab, shadow.card]}>
          <Ionicons name="shield-checkmark" size={20} color={c.verified} />
        </View>
      </View>

      {/* Overdue fee — floats above the sheet */}
      {fee && !trip && !offer && (
        <View style={{ position: 'absolute', left: s.md, right: s.md, bottom: 250, backgroundColor: c.ink, borderRadius: r.md, padding: s.md, flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
          <Ionicons name="card" size={18} color={c.gold} />
          <Text style={{ color: c.onInk, flex: 1, fontSize: 13 }}>{money(fee.amount_inr)} setup fee overdue</Text>
          <Pressable onPress={() => act(() => callFn('trip-lifecycle', { action: 'pay_setup_fee' }))}><Text style={{ color: c.gold, fontWeight: '700' }}>Pay</Text></Pressable>
        </View>
      )}

      {/* Bottom sheet */}
      <View style={[mapStyles.sheet, { paddingBottom: s.lg }, shadow.hero]}>
        <View style={mapStyles.grabber} />
        {error && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.sm, marginBottom: s.md }}>
            <Ionicons name="alert-circle" size={16} color={c.danger} />
            <Text style={{ color: c.danger, flex: 1, fontWeight: '600', fontSize: 13 }}>{error}</Text>
          </View>
        )}

        {trip ? (
          <TripSheet trip={trip} busy={busy} otpInput={otpInput} setOtpInput={setOtpInput} act={act} />
        ) : offer ? (
          <RequestSheet offer={offer} detail={detail} countdown={countdown} busy={busy} act={act} />
        ) : online ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
              <View style={mapStyles.livedot} />
              <Text style={[t.h2, { color: c.ink }]}>You're online</Text>
            </View>
            <Text style={{ color: c.inkMuted, marginTop: 2 }}>Looking for trips near you…</Text>
            <View style={{ flexDirection: 'row', gap: s.sm, marginTop: s.lg }}>
              <Stat label="Today" value={money(todayEarnings)} />
              <Stat label="Trips" value={String(todayTrips.length)} />
              <Stat label="Rating" value={rating ? rating.toFixed(1) : '—'} />
            </View>
            <Button label="Go offline" icon="power" variant="ghost" onPress={toggleOnline} loading={busy} style={{ marginTop: s.md }} />
          </View>
        ) : (
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: c.inkMuted, marginBottom: s.md }}>You're offline</Text>
            <Pressable onPress={toggleOnline} disabled={busy} style={({ pressed }) => [mapStyles.go, pressed && { transform: [{ scale: 0.96 }] }]}>
              {busy ? <ActivityIndicator color="#4A2D00" /> : <Text style={{ fontWeight: '800', fontSize: 24, letterSpacing: 1, color: '#4A2D00' }}>GO</Text>}
            </Pressable>
            <View style={{ flexDirection: 'row', gap: s.sm, marginTop: s.xl, alignSelf: 'stretch' }}>
              <Stat label="Today" value={money(todayEarnings)} />
              <Stat label="Trips" value={String(todayTrips.length)} />
              <Stat label="Rating" value={rating ? rating.toFixed(1) : '—'} />
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: s.md, alignItems: 'center' }}>
      <Text style={{ fontWeight: '800', fontSize: 15, color: c.ink }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: c.inkFaint, fontSize: 11, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function RequestSheet({ offer, detail, countdown, busy, act }: { offer: Offer; detail: OfferDetail | null; countdown: number; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  return (
    <View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.border, overflow: 'hidden', marginBottom: s.md }}>
        <View style={{ height: 4, width: `${(countdown / 30) * 100}%`, backgroundColor: c.brand }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Text style={[t.h2, { color: c.ink }]}>New request</Text>
            {detail && <Badge label={`${detail.categoryLabel}`} tone="warn" />}
          </View>
          {detail && <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
            <Text style={{ fontWeight: '800', fontSize: 26, color: c.ink }}>{detail.estFare != null ? money(detail.estFare) : detail.rate}</Text>
            <Text style={{ color: c.inkFaint, fontSize: 12 }}>{detail.estFare != null ? 'est. fare' : ''}</Text>
          </View>}
        </View>
        <View style={{ width: 46, height: 46, borderRadius: 23, borderWidth: 3, borderColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontWeight: '800', color: c.ink }}>{countdown}</Text>
        </View>
      </View>

      {detail && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, marginTop: s.md, backgroundColor: c.surfaceAlt, borderRadius: 14, padding: s.md }}>
          <Avatar name={detail.customerName} size={40} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, color: c.ink }}>{detail.customerName}</Text>
              {detail.verified && <Ionicons name="shield-checkmark" size={15} color={c.verified} />}
            </View>
            <Text style={{ color: c.inkMuted, fontSize: 12, marginTop: 1 }}>{detail.verified ? 'Aadhaar verified customer' : 'Customer'}</Text>
          </View>
        </View>
      )}

      <View style={{ marginTop: s.md, gap: s.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
          <Ionicons name="ellipse" size={10} color={c.online} />
          <Text style={{ color: c.ink, flex: 1 }} numberOfLines={1}>{detail?.pickupAddr ?? 'Pickup'}</Text>
          <Text style={{ color: c.inkFaint, fontSize: 12 }}>{offer.distance_km ?? '?'} km away</Text>
        </View>
        {detail?.destAddr && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Ionicons name="location" size={12} color={c.danger} />
            <Text style={{ color: c.ink, flex: 1 }} numberOfLines={1}>{detail.destAddr}</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: s.md, marginTop: s.lg }}>
        <Button label="Decline" variant="ghost" onPress={() => act(() => callFn('trip-lifecycle', { action: 'decline', trip_id: offer.trip_id }))} loading={busy} style={{ flex: 1 }} />
        <Button label="Accept" variant="primary" icon="checkmark" onPress={() => act(() => callFn('trip-lifecycle', { action: 'accept', trip_id: offer.trip_id }))} loading={busy} style={{ flex: 1.5 }} />
      </View>
    </View>
  );
}

function TripSheet({ trip, busy, otpInput, setOtpInput, act }: { trip: Trip; busy: boolean; otpInput: string; setOtpInput: (v: string) => void; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const m = cat(trip.category_slug);
  const steps = ['accepted', 'driver_arrived', 'in_progress', 'completed'];
  const activeIdx = Math.max(0, steps.indexOf(trip.status === 'paid' ? 'completed' : trip.status));
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialCommunityIcons name={m.icon} size={23} color={c.brandDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[t.h2, { color: c.ink }]}>{m.label} trip</Text>
          <Text style={{ color: c.inkMuted, fontSize: 13 }}>{trip.trip_type === 'per_km' ? 'Per-km' : `${trip.days} day`} · pay {trip.payment_mode === 'cash' ? 'cash' : 'in-app'}</Text>
        </View>
        <Badge label={trip.status.replaceAll('_', ' ')} tone="brand" />
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: s.md }}>
        {steps.map((_, i) => <View key={i} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= activeIdx ? c.online : c.border }} />)}
      </View>

      <View style={{ marginTop: s.md, gap: s.sm }}>
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

      <View style={{ marginTop: s.lg }}>
        {trip.status === 'accepted' && <Button label="I've arrived at pickup" icon="checkmark-done" onPress={() => act(() => callFn('trip-lifecycle', { action: 'arrive', trip_id: trip.id }))} loading={busy} />}
        {trip.status === 'driver_arrived' && (
          <View style={{ gap: s.md }}>
            <Text style={{ color: c.inkMuted, fontSize: 13 }}>Ask the customer for their 4-digit start code:</Text>
            <TextInput value={otpInput} onChangeText={setOtpInput} keyboardType="number-pad" maxLength={4} placeholder="––––" placeholderTextColor={c.inkFaint} style={{ borderWidth: 1.5, borderColor: c.border, borderRadius: r.md, textAlign: 'center', fontSize: 26, letterSpacing: 14, paddingVertical: s.md, color: c.ink, fontWeight: '800' }} />
            <Button label="Start trip" icon="play" variant="success" disabled={otpInput.length !== 4} loading={busy} onPress={() => act(async () => { await callFn('trip-lifecycle', { action: 'start', trip_id: trip.id, otp: otpInput }); setOtpInput(''); })} />
          </View>
        )}
        {trip.status === 'in_progress' && <Button label="End trip" icon="stop" variant="danger" loading={busy} onPress={() => Alert.alert('End trip?', 'The fare is calculated from the distance travelled.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End trip', style: 'destructive', onPress: () => act(() => callFn('trip-lifecycle', { action: 'end', trip_id: trip.id })) }])} />}
        {trip.status === 'completed' && (
          <View style={{ gap: s.md }}>
            <View style={{ backgroundColor: c.surfaceAlt, borderRadius: r.md, padding: s.md, alignItems: 'center' }}>
              <Text style={{ color: c.inkMuted, fontSize: 13 }}>Fare {trip.distance_km ? `· ${trip.distance_km} km` : ''}</Text>
              <Text style={{ color: c.ink, fontSize: 30, fontWeight: '800', marginTop: 2 }}>{money(trip.fare_total)}</Text>
            </View>
            {trip.payment_mode === 'cash' && trip.payment_status === 'pending' && <Button label="Cash collected" icon="cash" variant="success" loading={busy} onPress={() => act(() => callFn('trip-lifecycle', { action: 'cash_collected', trip_id: trip.id }))} />}
            {trip.payment_status === 'collected_claimed' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s.sm }}><Ionicons name="time-outline" size={16} color={c.inkMuted} /><Text style={{ color: c.inkMuted }}>Waiting for customer to confirm…</Text></View>}
            {trip.payment_mode === 'in_app' && trip.payment_status === 'pending' && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s.sm }}><Ionicons name="time-outline" size={16} color={c.inkMuted} /><Text style={{ color: c.inkMuted }}>Waiting for in-app payment…</Text></View>}
          </View>
        )}
        {trip.status === 'paid' && <Button label="Close trip" icon="checkmark-circle" loading={busy} onPress={() => act(() => callFn('trip-lifecycle', { action: 'close', trip_id: trip.id }))} />}
        {['accepted', 'driver_arrived'].includes(trip.status) && <Pressable onPress={() => act(() => callFn('trip-lifecycle', { action: 'cancel', trip_id: trip.id }))} style={{ paddingTop: s.md }}><Text style={{ color: c.danger, textAlign: 'center', fontWeight: '600' }}>Cancel trip</Text></Pressable>}
      </View>
    </View>
  );
}

const mapStyles = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: s.lg, paddingTop: s.sm },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: c.border, alignSelf: 'center', marginBottom: s.md },
  fab: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surface, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9 },
  go: { width: 108, height: 108, borderRadius: 54, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  livedot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.online },
  mePin: { width: 34, height: 34, borderRadius: 17, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.onInk },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing, FadeIn, FadeInDown, FadeInUp, SlideInDown, useAnimatedStyle,
  useSharedValue, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { calculateFare, haversineKm } from '@acting/shared';
import { supabase, callFn } from '@/lib/supabase';
import { MAP_STYLE } from '@/lib/mapStyle';
import { c, money, motion, r, s, shadow, type as t } from '@/lib/theme';
import { Avatar, Badge, Button, Touch } from '@/lib/components';

const CHENNAI = { latitude: 13.0827, longitude: 80.2707, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const LOCATION_PING_MS = 5000;

type Trip = { id: string; status: string; trip_type: string; category_slug: string; pickup_address: string | null; destination_address: string | null; payment_mode: string; payment_status: string; fare_total: number | null; distance_km: number | null; customer_id: string; days: number | null; closed_at: string | null };
type Offer = { id: string; trip_id: string; distance_km: number | null; expires_at: string };
type OfferDetail = { categoryLabel: string; tripType: string; pickupAddr: string; destAddr: string | null; customerName: string; verified: boolean; estFare: number | null; rate: string };
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
  const [myCats, setMyCats] = useState<string[]>([]);
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
    const [{ data: dp }, { data: pr }, { data: sf }, { data: activeTrip }, { data: closed }, { data: dc }] = await Promise.all([
      supabase.from('driver_profiles').select('trips_completed, rating_avg').eq('driver_id', userId).maybeSingle(),
      supabase.from('driver_presence').select('status').eq('driver_id', userId).maybeSingle(),
      supabase.from('setup_fees').select('amount_inr, status, due_at').eq('driver_id', userId).maybeSingle(),
      supabase.from('trips').select('*').eq('driver_id', userId).in('status', ['accepted', 'driver_arrived', 'in_progress', 'completed', 'paid']).order('requested_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('trips').select('id, fare_total, closed_at, category_slug').eq('driver_id', userId).eq('status', 'closed').order('closed_at', { ascending: false }).limit(30),
      supabase.from('driver_categories').select('category_slug, active').eq('driver_id', userId),
    ]);
    if (dp) setRating(dp.rating_avg);
    setMyCats(((dc as { category_slug: string; active: boolean }[]) ?? []).filter((x) => x.active).map((x) => x.category_slug));
    setPresence(((pr?.status as typeof presence) ?? 'offline'));
    setFee(sf?.status === 'pending' && new Date(sf.due_at) < new Date() ? (sf as Fee) : null);
    setTrip(activeTrip as Trip | null);
    setRecent((closed as Trip[]) ?? []);
    if (!activeTrip) {
      const { data: offers } = await supabase.from('trip_requests').select('id, trip_id, distance_km, expires_at').eq('driver_id', userId).eq('status', 'pending').gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1);
      setOffer((offers?.[0] as Offer) ?? null);
    } else setOffer(null);
  }, []);

  useEffect(() => {
    if (!offer || !uid) { setDetail(null); return; }
    (async () => {
      const { data: tr } = await supabase.from('trips').select('category_slug, trip_type, days, pickup_location, destination_location, pickup_address, destination_address, customer_id').eq('id', offer.trip_id).maybeSingle();
      if (!tr) return;
      const [{ data: cust }, { data: dc }] = await Promise.all([
        supabase.from('profiles').select('full_name, kyc_verified_at').eq('id', tr.customer_id).maybeSingle(),
        supabase.from('driver_categories').select('price_per_km, price_per_day').eq('driver_id', uid).eq('category_slug', tr.category_slug).maybeSingle(),
      ]);
      let estFare: number | null = null, rate = '';
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
      } catch { /* estimate is optional */ }
      setDetail({ categoryLabel: cat(tr.category_slug).label, tripType: tr.trip_type, pickupAddr: tr.pickup_address ?? 'Pickup', destAddr: tr.destination_address, customerName: cust?.full_name ?? 'Customer', verified: !!cust?.kyc_verified_at, estFare, rate });
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
        mapRef.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 700);
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
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        customMapStyle={MAP_STYLE as any}
        initialRegion={CHENNAI}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation={!trip}
        showsMyLocationButton={false}
        showsCompass={false}
      >
        {trip && meLoc && (
          <Marker coordinate={meLoc} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={st.mePin}><MaterialCommunityIcons name={cat(trip.category_slug).icon} size={16} color={c.onInk} /></View>
          </Marker>
        )}
      </MapView>

      {/* top bar */}
      <Animated.View entering={FadeInDown.delay(80).springify().damping(18)} style={{ position: 'absolute', top: insets.top + s.sm, left: s.md, right: s.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Touch onPress={() => router.push('/account')} style={[st.fab, shadow.card]}>
          <Avatar name={name} uri={photo} size={46} />
        </Touch>
        <View style={[st.pill, shadow.card]}>
          <Ionicons name="trending-up" size={15} color={c.online} />
          <Text style={{ fontWeight: '800', fontSize: 14, color: c.ink, letterSpacing: -0.2 }}>{money(todayEarnings)} today</Text>
        </View>
        <View style={[st.fab, shadow.card, { backgroundColor: c.surface }]}>
          <Ionicons name="shield-checkmark" size={20} color={c.verified} />
        </View>
      </Animated.View>

      {fee && !trip && !offer && (
        <Animated.View entering={FadeIn} style={[st.feeBar, { bottom: 262 }]}>
          <Ionicons name="card" size={17} color={c.brand} />
          <Text style={{ color: c.ink, flex: 1, fontSize: 13, fontWeight: '600' }}>{money(fee.amount_inr)} setup fee overdue</Text>
          <Touch onPress={() => act(() => callFn('trip-lifecycle', { action: 'pay_setup_fee' }))}><Text style={{ color: c.brand, fontWeight: '800' }}>Pay</Text></Touch>
        </Animated.View>
      )}

      {/* sheet */}
      <Animated.View entering={SlideInDown.springify().damping(20).mass(0.9)} style={[st.sheet, { paddingBottom: insets.bottom ? s.sm : s.lg }, shadow.hero]}>
        <View style={st.grabber} />
        {error && (
          <Animated.View entering={FadeIn} style={st.errBar}>
            <Ionicons name="alert-circle" size={16} color={c.danger} />
            <Text style={{ color: c.danger, flex: 1, fontWeight: '700', fontSize: 13 }}>{error}</Text>
          </Animated.View>
        )}

        {trip ? <TripSheet trip={trip} busy={busy} otpInput={otpInput} setOtpInput={setOtpInput} act={act} />
          : offer ? <RequestSheet offer={offer} detail={detail} countdown={countdown} busy={busy} act={act} />
          : online ? <OnlineSheet earnings={todayEarnings} trips={todayTrips.length} rating={rating} busy={busy} onToggle={toggleOnline} cats={myCats} />
          : <OfflineSheet earnings={todayEarnings} trips={todayTrips.length} rating={rating} busy={busy} onGo={toggleOnline} cats={myCats} />}
      </Animated.View>
    </View>
  );
}

/** Chips showing which vehicles the driver acts as; tap to manage. */
function CatChips({ cats }: { cats: string[] }) {
  return (
    <Touch onPress={() => router.push('/vehicles')} scaleTo={0.98} style={{ alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.surfaceAlt, borderRadius: 14, padding: s.md }}>
        <Text style={{ color: c.inkFaint, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>ACTING AS</Text>
        <View style={{ flexDirection: 'row', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {cats.length === 0 ? (
            <Text style={{ color: c.warn, fontWeight: '700', fontSize: 13 }}>No vehicles set — tap to add</Text>
          ) : (
            cats.map((slug) => (
              <View key={slug} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 }}>
                <MaterialCommunityIcons name={cat(slug).icon} size={14} color={c.brand} />
                <Text style={{ color: c.brand, fontWeight: '800', fontSize: 12 }}>{cat(slug).label}</Text>
              </View>
            ))
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={c.inkFaint} />
      </View>
    </Touch>
  );
}

/* ── Offline: the GO moment ─────────────────────────────────────────────── */
function OfflineSheet({ earnings, trips, rating, busy, onGo, cats }: { earnings: number; trips: number; rating: number | null; busy: boolean; onGo: () => void; cats: string[] }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);
  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.55 }],
    opacity: 0.45 * (1 - pulse.value),
  }));
  return (
    <View style={{ alignItems: 'center' }}>
      <Animated.Text entering={FadeIn} style={{ color: c.inkMuted, marginBottom: s.lg, fontWeight: '600' }}>You're offline</Animated.Text>
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={[st.halo, halo]} pointerEvents="none" />
        <Touch onPress={onGo} disabled={busy} scaleTo={0.92} style={[st.go, shadow.glow]}>
          {busy ? <ActivityIndicator color={c.onInk} size="large" /> : <Text style={st.goText}>GO</Text>}
        </Touch>
      </View>
      <Animated.View entering={FadeInUp.delay(120)} style={{ gap: s.sm, marginTop: s.xxl, alignSelf: 'stretch' }}>
        <CatChips cats={cats} />
        <View style={{ flexDirection: 'row', gap: s.sm }}>
          <Stat label="Today" value={money(earnings)} />
          <Stat label="Trips" value={String(trips)} />
          <Stat label="Rating" value={rating ? rating.toFixed(1) : '—'} />
        </View>
      </Animated.View>
    </View>
  );
}

/* ── Online: searching ──────────────────────────────────────────────────── */
function OnlineSheet({ earnings, trips, rating, busy, onToggle, cats }: { earnings: number; trips: number; rating: number | null; busy: boolean; onToggle: () => void; cats: string[] }) {
  const beat = useSharedValue(0);
  useEffect(() => {
    beat.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0, { duration: 700 })), -1, false);
  }, [beat]);
  const dot = useAnimatedStyle(() => ({ opacity: 0.35 + beat.value * 0.65, transform: [{ scale: 0.85 + beat.value * 0.35 }] }));
  return (
    <Animated.View entering={FadeIn}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
        <Animated.View style={[st.livedot, dot]} />
        <Text style={[t.h2, { color: c.ink }]}>You're online</Text>
      </View>
      <Text style={{ color: c.inkMuted, marginTop: 3, fontWeight: '500' }}>Looking for trips near you…</Text>
      <View style={{ marginTop: s.lg, gap: s.sm }}>
        <CatChips cats={cats} />
        <View style={{ flexDirection: 'row', gap: s.sm }}>
          <Stat label="Today" value={money(earnings)} />
          <Stat label="Trips" value={String(trips)} />
          <Stat label="Rating" value={rating ? rating.toFixed(1) : '—'} />
        </View>
      </View>
      <Button label="Go offline" icon="power" variant="ghost" onPress={onToggle} loading={busy} style={{ marginTop: s.md }} />
    </Animated.View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={st.stat}>
      <Text style={{ fontWeight: '800', fontSize: 17, color: c.ink, letterSpacing: -0.4 }} numberOfLines={1}>{value}</Text>
      <Text style={{ color: c.inkFaint, fontSize: 11, marginTop: 3, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/* ── Incoming request ───────────────────────────────────────────────────── */
function RequestSheet({ offer, detail, countdown, busy, act }: { offer: Offer; detail: OfferDetail | null; countdown: number; busy: boolean; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const pct = Math.max(0, Math.min(1, countdown / 30));
  const bar = useAnimatedStyle(() => ({ width: withTiming(`${pct * 100}%`, { duration: 480, easing: Easing.linear }) }));
  return (
    <Animated.View entering={FadeInUp.springify().damping(20)}>
      <View style={st.timerTrack}><Animated.View style={[st.timerFill, bar]} /></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: s.md }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Text style={[t.h2, { color: c.ink }]}>New request</Text>
            {detail && <Badge label={detail.categoryLabel} tone="brand" />}
          </View>
          {detail && (
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
              <Text style={{ fontWeight: '800', fontSize: 32, color: c.brand, letterSpacing: -1 }}>{detail.estFare != null ? money(detail.estFare) : detail.rate}</Text>
              {detail.estFare != null && <Text style={{ color: c.inkFaint, fontSize: 12, fontWeight: '600' }}>est. fare</Text>}
            </View>
          )}
        </View>
        <View style={st.ring}><Text style={{ fontWeight: '800', color: c.ink, fontSize: 17 }}>{countdown}</Text></View>
      </View>

      {detail && (
        <View style={st.custCard}>
          <Avatar name={detail.customerName} size={42} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text style={{ fontWeight: '700', fontSize: 15, color: c.ink }}>{detail.customerName}</Text>
              {detail.verified && <Ionicons name="shield-checkmark" size={15} color={c.verified} />}
            </View>
            <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2, fontWeight: '500' }}>{detail.verified ? 'Aadhaar verified customer' : 'Customer'}</Text>
          </View>
        </View>
      )}

      <View style={{ marginTop: s.md, gap: s.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
          <View style={st.dotGreen} />
          <Text style={{ color: c.ink, flex: 1, fontWeight: '600' }} numberOfLines={1}>{detail?.pickupAddr ?? 'Pickup'}</Text>
          <Text style={{ color: c.inkFaint, fontSize: 12, fontWeight: '600' }}>{offer.distance_km ?? '?'} km</Text>
        </View>
        {detail?.destAddr && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Ionicons name="location" size={13} color={c.danger} />
            <Text style={{ color: c.ink, flex: 1, fontWeight: '600' }} numberOfLines={1}>{detail.destAddr}</Text>
          </View>
        )}
      </View>

      <Button label="Accept" icon="checkmark" onPress={() => act(() => callFn('trip-lifecycle', { action: 'accept', trip_id: offer.trip_id }))} loading={busy} style={{ marginTop: s.lg }} />
      <Touch onPress={() => act(() => callFn('trip-lifecycle', { action: 'decline', trip_id: offer.trip_id }))} style={{ paddingVertical: s.md }}>
        <Text style={{ color: c.inkMuted, textAlign: 'center', fontWeight: '700' }}>Decline</Text>
      </Touch>
    </Animated.View>
  );
}

/* ── Active trip ────────────────────────────────────────────────────────── */
function TripSheet({ trip, busy, otpInput, setOtpInput, act }: { trip: Trip; busy: boolean; otpInput: string; setOtpInput: (v: string) => void; act: (fn: () => Promise<unknown>) => Promise<void> }) {
  const m = cat(trip.category_slug);
  const steps = ['accepted', 'driver_arrived', 'in_progress', 'completed'];
  const activeIdx = Math.max(0, steps.indexOf(trip.status === 'paid' ? 'completed' : trip.status));
  return (
    <Animated.View entering={FadeIn}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
        <View style={st.catIcon}><MaterialCommunityIcons name={m.icon} size={23} color={c.brand} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[t.h2, { color: c.ink }]}>{m.label} trip</Text>
          <Text style={{ color: c.inkMuted, fontSize: 13, fontWeight: '500' }}>{trip.trip_type === 'per_km' ? 'Per-km' : `${trip.days} day`} · pay {trip.payment_mode === 'cash' ? 'cash' : 'in-app'}</Text>
        </View>
        <Badge label={trip.status.replaceAll('_', ' ')} tone="brand" />
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: s.md }}>
        {steps.map((_, i) => (
          <Animated.View key={i} entering={FadeIn.delay(i * 60)} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= activeIdx ? c.online : c.surfaceHi }} />
        ))}
      </View>

      <View style={{ marginTop: s.md, gap: s.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
          <View style={st.dotGreen} />
          <Text style={{ color: c.ink, flex: 1, fontWeight: '600' }} numberOfLines={1}>{trip.pickup_address ?? 'Pickup location'}</Text>
        </View>
        {trip.destination_address && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Ionicons name="location" size={13} color={c.danger} />
            <Text style={{ color: c.ink, flex: 1, fontWeight: '600' }} numberOfLines={1}>{trip.destination_address}</Text>
          </View>
        )}
      </View>

      <View style={{ marginTop: s.lg }}>
        {trip.status === 'accepted' && <Button label="I've arrived at pickup" icon="checkmark-done" onPress={() => act(() => callFn('trip-lifecycle', { action: 'arrive', trip_id: trip.id }))} loading={busy} />}
        {trip.status === 'driver_arrived' && (
          <View style={{ gap: s.md }}>
            <Text style={{ color: c.inkMuted, fontSize: 13, fontWeight: '500' }}>Ask the customer for their 4-digit start code:</Text>
            <TextInput value={otpInput} onChangeText={setOtpInput} keyboardType="number-pad" maxLength={4} placeholder="––––" placeholderTextColor={c.inkFaint} style={st.otp} />
            <Button label="Start trip" icon="play" variant="success" disabled={otpInput.length !== 4} loading={busy} onPress={() => act(async () => { await callFn('trip-lifecycle', { action: 'start', trip_id: trip.id, otp: otpInput }); setOtpInput(''); })} />
          </View>
        )}
        {trip.status === 'in_progress' && <Button label="End trip" icon="stop" variant="danger" loading={busy} onPress={() => Alert.alert('End trip?', 'The fare is calculated from the distance travelled.', [{ text: 'Cancel', style: 'cancel' }, { text: 'End trip', style: 'destructive', onPress: () => act(() => callFn('trip-lifecycle', { action: 'end', trip_id: trip.id })) }])} />}
        {trip.status === 'completed' && (
          <View style={{ gap: s.md }}>
            <Animated.View entering={FadeInUp.springify()} style={st.fareBox}>
              <Text style={{ color: c.inkMuted, fontSize: 13, fontWeight: '600' }}>Fare {trip.distance_km ? `· ${trip.distance_km} km` : ''}</Text>
              <Text style={{ color: c.brand, fontSize: 36, fontWeight: '800', marginTop: 2, letterSpacing: -1 }}>{money(trip.fare_total)}</Text>
            </Animated.View>
            {trip.payment_mode === 'cash' && trip.payment_status === 'pending' && <Button label="Cash collected" icon="cash" variant="success" loading={busy} onPress={() => act(() => callFn('trip-lifecycle', { action: 'cash_collected', trip_id: trip.id }))} />}
            {trip.payment_status === 'collected_claimed' && <Waiting text="Waiting for customer to confirm…" />}
            {trip.payment_mode === 'in_app' && trip.payment_status === 'pending' && <Waiting text="Waiting for in-app payment…" />}
          </View>
        )}
        {trip.status === 'paid' && <Button label="Close trip" icon="checkmark-circle" loading={busy} onPress={() => act(() => callFn('trip-lifecycle', { action: 'close', trip_id: trip.id }))} />}
        {['accepted', 'driver_arrived'].includes(trip.status) && (
          <Touch onPress={() => act(() => callFn('trip-lifecycle', { action: 'cancel', trip_id: trip.id }))} style={{ paddingTop: s.md }}>
            <Text style={{ color: c.danger, textAlign: 'center', fontWeight: '700' }}>Cancel trip</Text>
          </Touch>
        )}
      </View>
    </Animated.View>
  );
}

function Waiting({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s.sm }}>
      <ActivityIndicator size="small" color={c.inkMuted} />
      <Text style={{ color: c.inkMuted, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: c.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: s.lg, paddingTop: s.sm, borderTopWidth: 1, borderColor: c.border },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: c.borderStrong, alignSelf: 'center', marginBottom: s.md },
  fab: { width: 46, height: 46, borderRadius: 23, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 1, borderColor: c.border },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: c.surface, borderRadius: 23, paddingHorizontal: 15, paddingVertical: 11, borderWidth: 1, borderColor: c.border },
  go: { width: 118, height: 118, borderRadius: 59, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  goText: { fontWeight: '800', fontSize: 30, letterSpacing: 1.5, color: c.onInk },
  halo: { position: 'absolute', width: 118, height: 118, borderRadius: 59, backgroundColor: c.brand },
  livedot: { width: 11, height: 11, borderRadius: 6, backgroundColor: c.online },
  mePin: { width: 36, height: 36, borderRadius: 18, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.surface },
  stat: { flex: 1, backgroundColor: c.surfaceAlt, borderRadius: 14, paddingVertical: s.md, alignItems: 'center' },
  errBar: { flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.sm, marginBottom: s.md },
  feeBar: { position: 'absolute', left: s.md, right: s.md, backgroundColor: c.surfaceAlt, borderRadius: r.md, padding: s.md, flexDirection: 'row', alignItems: 'center', gap: s.sm, borderWidth: 1, borderColor: c.border },
  timerTrack: { height: 4, borderRadius: 2, backgroundColor: c.surfaceHi, overflow: 'hidden' },
  timerFill: { height: 4, backgroundColor: c.brand, borderRadius: 2 },
  ring: { width: 50, height: 50, borderRadius: 25, borderWidth: 3, borderColor: c.brand, alignItems: 'center', justifyContent: 'center' },
  custCard: { flexDirection: 'row', alignItems: 'center', gap: s.sm, marginTop: s.md, backgroundColor: c.surfaceAlt, borderRadius: 16, padding: s.md },
  catIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: c.brandSoft, alignItems: 'center', justifyContent: 'center' },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.online },
  otp: { borderWidth: 1.5, borderColor: c.border, borderRadius: r.md, textAlign: 'center', fontSize: 28, letterSpacing: 14, paddingVertical: s.md, color: c.ink, fontWeight: '800', backgroundColor: c.surfaceAlt },
  fareBox: { backgroundColor: c.surfaceAlt, borderRadius: r.md, padding: s.lg, alignItems: 'center' },
});

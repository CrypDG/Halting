import { useCallback, useEffect, useState } from 'react';
import { FlatList, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker } from 'react-native-maps';
import { getCategory, mockKycProvider, VEHICLE_CATEGORIES, type VehicleCategorySlug } from '@acting/shared';
import { callFn, supabase } from '@/lib/supabase';
import { colors, ui } from '@/lib/ui';

type NearbyDriver = {
  driver_id: string;
  full_name: string | null;
  rating_avg: number | null;
  trips_completed: number;
  experience_years: number | null;
  license_classes: string[];
  price_per_km: number | null;
  price_per_day: number | null;
  distance_km: number;
  lat: number;
  lng: number;
};

type Trip = {
  id: string;
  status: string;
  trip_type: string;
  category_slug: string;
  payment_mode: string;
  payment_status: string;
  fare_total: number | null;
  distance_km: number | null;
  driver_id: string | null;
  days: number | null;
};

const CHENNAI = { latitude: 13.0827, longitude: 80.2707 };
const ACTIVE_STATUSES = ['requested', 'accepted', 'driver_arrived', 'started', 'in_progress', 'completed', 'paid'];

export default function CustomerHome() {
  const [uid, setUid] = useState<string | null>(null);
  const [kycVerified, setKycVerified] = useState<boolean | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [center, setCenter] = useState(CHENNAI);
  const [category, setCategory] = useState<VehicleCategorySlug>('car');
  const [drivers, setDrivers] = useState<NearbyDriver[]>([]);
  const [radius, setRadius] = useState(10);
  const [booking, setBooking] = useState(false);
  const [tripType, setTripType] = useState<'per_km' | 'per_day'>('per_km');
  const [days, setDays] = useState('1');
  const [payMode, setPayMode] = useState<'cash' | 'in_app'>('cash');
  const [notes, setNotes] = useState('');
  const [trip, setTrip] = useState<Trip | null>(null);
  const [otp, setOtp] = useState<string | null>(null);
  const [driverName, setDriverName] = useState<string | null>(null);
  const [driverPos, setDriverPos] = useState<{ latitude: number; longitude: number } | null>(null);
  const [stars, setStars] = useState(0);
  const [rated, setRated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshTrip = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('trips')
      .select('id, status, trip_type, category_slug, payment_mode, payment_status, fare_total, distance_km, driver_id, days')
      .eq('customer_id', userId)
      .in('status', ACTIVE_STATUSES)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setTrip(data as Trip | null);
    if (data?.id) {
      const { data: secret } = await supabase.from('trip_secrets').select('start_otp').eq('trip_id', data.id).maybeSingle();
      setOtp(secret?.start_otp ?? null);
      if (data.driver_id) {
        const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', data.driver_id).maybeSingle();
        setDriverName(prof?.full_name ?? null);
      }
    }
  }, []);

  const loadNearby = useCallback(async (cat: VehicleCategorySlug, c: typeof CHENNAI, r: number) => {
    const { data, error } = await supabase.rpc('nearby_drivers', {
      p_category: cat,
      p_lat: c.latitude,
      p_lng: c.longitude,
      p_radius_km: r,
    });
    if (!error) setDrivers((data as NearbyDriver[]) ?? []);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const userId = data.session.user.id;
      setUid(userId);
      const { data: prof } = await supabase.from('profiles').select('kyc_verified_at, phone').eq('id', userId).maybeSingle();
      setKycVerified(!!prof?.kyc_verified_at);
      setPhone(prof?.phone ?? null);
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setCenter({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        } catch {
          // keep default center
        }
      }
      await refreshTrip(userId);
    });
  }, [refreshTrip]);

  // nearby search on category/center/radius change; auto-widen for rare categories (PRD §4.2)
  useEffect(() => {
    const cat = getCategory(category);
    const r = Math.max(radius, cat.defaultRadiusKm);
    loadNearby(category, center, r);
    const iv = setInterval(() => loadNearby(category, center, r), 10_000);
    return () => clearInterval(iv);
  }, [category, center, radius, loadNearby]);

  // trip updates: realtime + poll fallback; track driver position during active trip
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel('customer-home')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `customer_id=eq.${uid}` }, () => refreshTrip(uid))
      .subscribe();
    const poll = setInterval(() => refreshTrip(uid), 8000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [uid, refreshTrip]);

  useEffect(() => {
    if (!trip?.driver_id || !['accepted', 'driver_arrived', 'started', 'in_progress'].includes(trip.status)) {
      setDriverPos(null);
      return;
    }
    async function track() {
      const { data } = await supabase.rpc('nearby_drivers', {
        p_category: trip!.category_slug,
        p_lat: center.latitude,
        p_lng: center.longitude,
        p_radius_km: 50,
      });
      // driver presence row is directly readable during an active trip (RLS), but the
      // RPC already exposes coordinates for online drivers; fall back to direct read:
      const { data: pres } = await supabase
        .from('driver_presence')
        .select('location')
        .eq('driver_id', trip!.driver_id!)
        .maybeSingle();
      const loc = (pres?.location ?? null) as null | { coordinates: [number, number] };
      if (loc?.coordinates) setDriverPos({ latitude: loc.coordinates[1], longitude: loc.coordinates[0] });
      void data;
    }
    track();
    const iv = setInterval(track, 8000);
    return () => clearInterval(iv);
  }, [trip?.driver_id, trip?.status, trip, center]);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (uid) await refreshTrip(uid);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  if (kycVerified === null) {
    return (
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <Text style={ui.muted}>Loading…</Text>
      </View>
    );
  }

  // ── Aadhaar eKYC gate (PRD §3.1) ─────────────────────────────────────
  if (!kycVerified) {
    return (
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <View style={ui.card}>
          <Text style={ui.h2}>Verify your identity</Text>
          <Text style={ui.muted}>
            Aadhaar eKYC is required before your first booking. Only your masked Aadhaar number is stored.
          </Text>
          {error && <Text style={[ui.error, { marginTop: 8 }]}>{error}</Text>}
          <TouchableOpacity
            style={[ui.btn, { marginTop: 16 }]}
            disabled={busy}
            onPress={() =>
              act(async () => {
                const kyc = await mockKycProvider.verifyAadhaar({ phone: phone ?? '9999999999' });
                const { error } = await supabase.from('profiles').update({
                  masked_aadhaar: kyc.maskedAadhaar,
                  kyc_name: kyc.name,
                  kyc_dob: kyc.dob,
                  kyc_token: kyc.verificationToken,
                  kyc_verified_at: new Date().toISOString(),
                }).eq('id', uid!);
                if (error) throw new Error(error.message);
                setKycVerified(true);
              })
            }
          >
            <Text style={ui.btnText}>Run Aadhaar eKYC (mock)</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Active trip screen ───────────────────────────────────────────────
  if (trip) {
    return (
      <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={ui.h1}>Your trip</Text>
        <View style={[ui.card, { marginTop: 12 }]}>
          <Text style={ui.h2}>
            {trip.status === 'requested' && 'Finding you a driver…'}
            {trip.status === 'accepted' && `${driverName ?? 'Driver'} is on the way`}
            {trip.status === 'driver_arrived' && `${driverName ?? 'Driver'} has arrived`}
            {trip.status === 'in_progress' && 'Trip in progress'}
            {trip.status === 'completed' && 'Trip completed'}
            {trip.status === 'paid' && 'Payment confirmed'}
          </Text>
          <Text style={ui.muted}>
            {trip.category_slug} · {trip.trip_type === 'per_km' ? 'per-km' : `${trip.days} day(s)`} · pay by {trip.payment_mode}
          </Text>

          {['accepted', 'driver_arrived'].includes(trip.status) && otp && (
            <View style={{ marginTop: 16, alignItems: 'center' }}>
              <Text style={ui.muted}>Share this OTP with the driver in person to start:</Text>
              <Text style={{ fontSize: 40, fontWeight: '800', letterSpacing: 12, marginTop: 4 }}>{otp}</Text>
            </View>
          )}

          {driverPos && (
            <MapView
              style={{ height: 200, borderRadius: 12, marginTop: 16 }}
              region={{ ...driverPos, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
            >
              <Marker coordinate={driverPos} title={driverName ?? 'Driver'} />
              <Marker coordinate={center} title="You" pinColor="blue" />
            </MapView>
          )}

          {trip.status === 'completed' && (
            <>
              <Text style={[ui.h2, { marginTop: 16 }]}>Fare: ₹{trip.fare_total ?? '…'}</Text>
              {trip.distance_km != null && <Text style={ui.muted}>{trip.distance_km} km</Text>}
              {trip.payment_mode === 'cash' && trip.payment_status === 'collected_claimed' && (
                <TouchableOpacity style={[ui.btn, ui.btnGreen, { marginTop: 12 }]} disabled={busy}
                  onPress={() => act(() => callFn('trip-lifecycle', { action: 'confirm_cash', trip_id: trip.id }))}>
                  <Text style={ui.btnText}>I paid cash — confirm</Text>
                </TouchableOpacity>
              )}
              {trip.payment_mode === 'cash' && trip.payment_status === 'pending' && (
                <Text style={[ui.muted, { marginTop: 12 }]}>Pay the driver in cash; they will mark it collected.</Text>
              )}
              {trip.payment_mode === 'in_app' && trip.payment_status === 'pending' && (
                <TouchableOpacity style={[ui.btn, ui.btnGreen, { marginTop: 12 }]} disabled={busy}
                  onPress={() => act(() => callFn('trip-lifecycle', { action: 'pay_in_app', trip_id: trip.id }))}>
                  <Text style={ui.btnText}>Pay ₹{trip.fare_total} now (mock UPI)</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {trip.status === 'paid' && (
            <>
              {!rated && trip.driver_id && (
                <View style={{ marginTop: 16, alignItems: 'center' }}>
                  <Text style={ui.muted}>Rate your driver</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
                    {[1, 2, 3, 4, 5].map((s) => (
                      <TouchableOpacity key={s} onPress={() => setStars(s)}>
                        <Text style={{ fontSize: 32 }}>{s <= stars ? '★' : '☆'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {stars > 0 && (
                    <TouchableOpacity
                      disabled={busy}
                      onPress={() =>
                        act(async () => {
                          const { error } = await supabase.from('ratings').insert({
                            trip_id: trip.id,
                            rater_id: uid!,
                            ratee_id: trip.driver_id!,
                            stars,
                            tags: [],
                          });
                          if (error) throw new Error(error.message);
                          setRated(true);
                        })
                      }
                    >
                      <Text style={{ color: colors.green, fontWeight: '600' }}>Submit rating</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              <TouchableOpacity style={[ui.btn, { marginTop: 16 }]} disabled={busy}
                onPress={() => act(async () => {
                  await callFn('trip-lifecycle', { action: 'close', trip_id: trip.id });
                  setRated(false);
                  setStars(0);
                })}>
                <Text style={ui.btnText}>Done</Text>
              </TouchableOpacity>
            </>
          )}

          {['requested', 'accepted', 'driver_arrived'].includes(trip.status) && (
            <TouchableOpacity style={{ marginTop: 16 }} disabled={busy}
              onPress={() => act(() => callFn('trip-lifecycle', { action: 'cancel', trip_id: trip.id }))}>
              <Text style={{ color: colors.red, textAlign: 'center' }}>Cancel trip</Text>
            </TouchableOpacity>
          )}
          {error && <Text style={[ui.error, { marginTop: 12 }]}>{error}</Text>}
        </View>
      </ScrollView>
    );
  }

  // ── Map-first home (PRD §7) ──────────────────────────────────────────
  const cat = getCategory(category);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <MapView
        style={{ flex: 1 }}
        region={{ ...center, latitudeDelta: 0.15, longitudeDelta: 0.15 }}
        onRegionChangeComplete={(r) => setCenter({ latitude: r.latitude, longitude: r.longitude })}
      >
        <Marker coordinate={center} title="Pickup (your vehicle)" pinColor="blue" />
        {drivers.map((d) => (
          <Marker key={d.driver_id} coordinate={{ latitude: d.lat, longitude: d.lng }} title={d.full_name ?? 'Driver'} />
        ))}
      </MapView>

      <View style={{ position: 'absolute', top: 48, left: 0, right: 0 }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={VEHICLE_CATEGORIES}
          keyExtractor={(c) => c.slug}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => setCategory(item.slug)}
              style={{
                backgroundColor: category === item.slug ? colors.primary : '#fff',
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 8,
                elevation: 2,
              }}
            >
              <Text style={{ color: category === item.slug ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '55%' }}>
        <Text style={ui.h2}>
          {drivers.length} {cat.name.toLowerCase()} driver{drivers.length === 1 ? '' : 's'} nearby
        </Text>
        {drivers.length === 0 && (
          <TouchableOpacity onPress={() => setRadius((r) => Math.min(cat.maxRadiusKm, r >= 25 ? 50 : 25))}>
            <Text style={[ui.muted, { marginTop: 4 }]}>
              None within {Math.max(radius, cat.defaultRadiusKm)} km — tap to widen search radius.
            </Text>
          </TouchableOpacity>
        )}
        {error && <Text style={ui.error}>{error}</Text>}

        {!booking && (
          <FlatList
            data={drivers}
            keyExtractor={(d) => d.driver_id}
            style={{ marginTop: 8 }}
            renderItem={({ item: d }) => (
              <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 10 }}>
                <Text style={{ fontWeight: '600' }}>
                  {d.full_name ?? 'Driver'} · ★ {d.rating_avg ?? 'new'} · {d.trips_completed} trips
                </Text>
                <Text style={ui.muted}>
                  {d.distance_km.toFixed(1)} km away · ✅ Aadhaar ✅ {d.license_classes.join('/')} ✅ Police
                </Text>
                <Text style={{ marginTop: 2 }}>
                  {d.price_per_km != null ? `₹${d.price_per_km}/km` : ''}
                  {d.price_per_km != null && d.price_per_day != null ? ' · ' : ''}
                  {d.price_per_day != null ? `₹${d.price_per_day}/day` : ''}
                </Text>
              </View>
            )}
          />
        )}

        {booking && (
          <View style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['per_km', 'per_day'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setTripType(t)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    padding: 12,
                    alignItems: 'center',
                    backgroundColor: tripType === t ? colors.primary : colors.bg,
                  }}
                >
                  <Text style={{ color: tripType === t ? '#fff' : colors.text, fontWeight: '600' }}>
                    {t === 'per_km' ? 'Per-km trip' : 'Per-day hire'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {tripType === 'per_day' && (
              <TextInput style={[ui.input, { marginTop: 12 }]} placeholder="Number of days" keyboardType="numeric" value={days} onChangeText={setDays} />
            )}
            <TextInput style={[ui.input, { marginTop: tripType === 'per_km' ? 12 : 0 }]} placeholder="Notes (vehicle model, load…)" value={notes} onChangeText={setNotes} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['cash', 'in_app'] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  onPress={() => setPayMode(m)}
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    padding: 12,
                    alignItems: 'center',
                    backgroundColor: payMode === m ? colors.primary : colors.bg,
                  }}
                >
                  <Text style={{ color: payMode === m ? '#fff' : colors.text, fontWeight: '600' }}>
                    {m === 'cash' ? 'Cash' : 'In-app (UPI)'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[ui.btn, ui.btnGreen, { marginTop: 16 }]}
          disabled={busy || drivers.length === 0}
          onPress={() => {
            if (!booking) {
              setBooking(true);
              return;
            }
            act(async () => {
              await callFn('dispatch-trip', {
                category_slug: category,
                trip_type: tripType,
                payment_mode: payMode,
                days: tripType === 'per_day' ? Number(days) || 1 : undefined,
                notes: notes || undefined,
                pickup: { lat: center.latitude, lng: center.longitude, address: 'Pinned location' },
                // per-km demo destination: ~5 km south-west of pickup
                destination:
                  tripType === 'per_km'
                    ? { lat: center.latitude - 0.03, lng: center.longitude - 0.03, address: 'Destination (demo)' }
                    : undefined,
              });
              setBooking(false);
            });
          }}
        >
          <Text style={ui.btnText}>{booking ? 'BOOK DRIVER' : 'Book a driver'}</Text>
        </TouchableOpacity>
        {booking && (
          <TouchableOpacity onPress={() => setBooking(false)} style={{ marginTop: 10 }}>
            <Text style={{ color: colors.muted, textAlign: 'center' }}>Back to list</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={async () => {
            await supabase.auth.signOut();
            router.replace('/login');
          }}
          style={{ marginTop: 12 }}
        >
          <Text style={{ color: colors.muted, textAlign: 'center', fontSize: 12 }}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { c, money, s, type as t } from '@/lib/theme';
import { Card, IconChip, ScreenHeader, StatTile } from '@/lib/components';

type Trip = {
  id: string; category_slug: string; trip_type: string; fare_total: number | null;
  distance_km: number | null; days: number | null; closed_at: string | null;
};

const CATEGORY: Record<string, { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string }> = {
  car: { icon: 'car', label: 'Car' }, tractor: { icon: 'tractor', label: 'Tractor' },
  truck: { icon: 'truck', label: 'Truck' }, bus: { icon: 'bus', label: 'Bus' },
  school_bus: { icon: 'bus-school', label: 'School Bus' }, crane: { icon: 'crane', label: 'Crane' },
  earth_mover: { icon: 'excavator', label: 'Earth Mover' },
};
const cat = (slug: string) => CATEGORY[slug] ?? { icon: 'steering' as const, label: slug };

function startOfWeek(): number {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day);
  return d.getTime();
}

/** Group trips by calendar day for a sectioned history. */
function groupByDay(trips: Trip[]) {
  const groups: { label: string; trips: Trip[]; total: number }[] = [];
  const today = new Date().toDateString();
  const yest = new Date(Date.now() - 864e5).toDateString();
  for (const tr of trips) {
    const dk = tr.closed_at ? new Date(tr.closed_at).toDateString() : 'Unknown';
    const label = dk === today ? 'Today' : dk === yest ? 'Yesterday' : dk === 'Unknown' ? 'Unknown' : new Date(tr.closed_at!).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    let g = groups.find((x) => x.label === label);
    if (!g) { g = { label, trips: [], total: 0 }; groups.push(g); }
    g.trips.push(tr);
    g.total += tr.fare_total ?? 0;
  }
  return groups;
}

export default function Activity() {
  const insets = useSafeAreaInsets();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return;
    const { data } = await supabase.from('trips').select('id, category_slug, trip_type, fare_total, distance_km, days, closed_at').eq('driver_id', sess.session.user.id).eq('status', 'closed').order('closed_at', { ascending: false }).limit(100);
    setTrips((data as Trip[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const total = trips.reduce((a, x) => a + (x.fare_total ?? 0), 0);
  const weekStart = startOfWeek();
  const weekEarnings = trips.filter((x) => x.closed_at && new Date(x.closed_at).getTime() >= weekStart).reduce((a, x) => a + (x.fare_total ?? 0), 0);
  const groups = groupByDay(trips);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + s.md, padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Activity" subtitle="Your earnings and trip history" />

      <Card>
        <View style={{ flexDirection: 'row', gap: s.md }}>
          <StatTile icon="calendar-outline" tint={c.brand} value={money(weekEarnings)} label="This week" />
          <StatTile icon="wallet-outline" tint={c.online} value={money(total)} label="Total earned" />
          <StatTile icon="navigate-outline" tint={c.gold} value={String(trips.length)} label="Trips" />
        </View>
      </Card>

      {loading ? (
        <Text style={{ color: c.inkMuted, textAlign: 'center', marginTop: s.xl }}>Loading…</Text>
      ) : trips.length === 0 ? (
        <Card>
          <View style={{ alignItems: 'center', gap: s.sm, paddingVertical: s.xxl }}>
            <IconChip icon="receipt-outline" tint={c.inkFaint} />
            <Text style={[t.h3, { color: c.ink }]}>No trips yet</Text>
            <Text style={{ color: c.inkFaint, textAlign: 'center', maxWidth: 260, lineHeight: 20 }}>Once you complete trips, your full history and earnings show up here.</Text>
          </View>
        </Card>
      ) : (
        groups.map((g) => (
          <View key={g.label}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s.sm, paddingHorizontal: s.xs }}>
              <Text style={[t.label, { color: c.inkMuted }]}>{g.label}</Text>
              <Text style={[t.label, { color: c.ink }]}>{money(g.total)}</Text>
            </View>
            <Card style={{ padding: s.xs }}>
              {g.trips.map((tr, i) => {
                const m = cat(tr.category_slug);
                return (
                  <View key={tr.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md, padding: s.md }}>
                      <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialCommunityIcons name={m.icon} size={22} color={c.ink} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>{m.label}</Text>
                        <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2 }}>
                          {tr.closed_at ? new Date(tr.closed_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}
                          {tr.trip_type === 'per_km' && tr.distance_km ? ` · ${tr.distance_km} km` : tr.days ? ` · ${tr.days} day(s)` : ''}
                        </Text>
                      </View>
                      <Text style={{ color: c.ink, fontWeight: '800', fontSize: 15 }}>{money(tr.fare_total)}</Text>
                    </View>
                    {i < g.trips.length - 1 && <View style={{ height: 1, backgroundColor: c.border, marginLeft: 70 }} />}
                  </View>
                );
              })}
            </Card>
          </View>
        ))
      )}
    </ScrollView>
  );
}

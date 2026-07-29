import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { permittedCategories, VEHICLE_CATEGORIES, type LicenseClass } from '@acting/shared';
import { supabase } from '@/lib/supabase';
import { c, money, r, s, type as t } from '@/lib/theme';
import { Badge, Button, Card, Header, Touch } from '@/lib/components';

type Row = {
  category_slug: string;
  price_per_km: number | null;
  price_per_day: number | null;
  overtime_per_hour: number | null;
  active: boolean;
};
type Draft = { perKm: string; perDay: string; overtime: string };

const CAT_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  car: 'car', tractor: 'tractor', truck: 'truck', bus: 'bus',
  school_bus: 'bus-school', crane: 'crane', earth_mover: 'excavator',
};

/** What the driver "acts" as — his vehicle categories, rates and availability. */
export default function Vehicles() {
  const [uid, setUid] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [classes, setClasses] = useState<LicenseClass[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ perKm: '', perDay: '', overtime: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    const id = sess.session.user.id;
    setUid(id);
    const [{ data: dc }, { data: dp }] = await Promise.all([
      supabase.from('driver_categories').select('category_slug, price_per_km, price_per_day, overtime_per_hour, active').eq('driver_id', id),
      supabase.from('driver_profiles').select('license_classes').eq('driver_id', id).maybeSingle(),
    ]);
    setRows(Object.fromEntries(((dc as Row[]) ?? []).map((row) => [row.category_slug, row])));
    setClasses((dp?.license_classes as LicenseClass[]) ?? []);
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const allowed = permittedCategories(classes);
  const mine = VEHICLE_CATEGORIES.filter((v) => rows[v.slug]);
  const addable = VEHICLE_CATEGORIES.filter((v) => allowed.includes(v.slug) && !rows[v.slug]);

  function startEdit(slug: string) {
    const row = rows[slug];
    setDraft({
      perKm: row?.price_per_km != null ? String(row.price_per_km) : '',
      perDay: row?.price_per_day != null ? String(row.price_per_day) : '',
      overtime: row?.overtime_per_hour != null ? String(row.overtime_per_hour) : '',
    });
    setEditing(slug);
    setErr(null);
  }

  async function saveRates(slug: string) {
    if (!uid) return;
    if (!draft.perKm && !draft.perDay) { setErr('Set at least a per-km or per-day rate'); return; }
    setBusy(slug); setErr(null);
    try {
      const { error } = await supabase.from('driver_categories').upsert({
        driver_id: uid,
        category_slug: slug,
        price_per_km: draft.perKm ? Number(draft.perKm) : null,
        price_per_day: draft.perDay ? Number(draft.perDay) : null,
        overtime_per_hour: draft.overtime ? Number(draft.overtime) : null,
      });
      if (error) throw error;
      setEditing(null);
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed';
      setErr(/out of allowed range/i.test(msg) ? 'That rate is outside the allowed range for this category' : msg);
    } finally { setBusy(null); }
  }

  async function toggleActive(slug: string, active: boolean) {
    if (!uid) return;
    setRows((prev) => ({ ...prev, [slug]: { ...prev[slug], active } }));
    const { error } = await supabase.from('driver_categories').update({ active }).eq('driver_id', uid).eq('category_slug', slug);
    if (error) { setErr(error.message); await load(); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Vehicles & rates" />
      <ScrollView
        contentContainerStyle={{ padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={c.inkMuted} />}
      >
        <View style={{ flexDirection: 'row', gap: s.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.inkMuted, lineHeight: 20, fontWeight: '500' }}>
              You appear to customers only for vehicles your licence
              <Text style={{ color: c.ink, fontWeight: '800' }}> ({classes.join(', ') || '—'}) </Text>
              permits. Toggle a vehicle off to stop receiving its requests.
            </Text>
          </View>
        </View>

        {err && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.md }}>
            <Ionicons name="alert-circle" size={18} color={c.danger} />
            <Text style={{ color: c.danger, flex: 1, fontWeight: '700' }}>{err}</Text>
          </View>
        )}

        {/* My vehicles */}
        <View style={{ gap: s.md }}>
          <Text style={[t.label, { color: c.inkFaint, paddingHorizontal: s.xs }]}>Acting as</Text>
          {mine.length === 0 && !loading && (
            <Card><Text style={{ color: c.inkMuted, textAlign: 'center', paddingVertical: s.md, fontWeight: '600' }}>No vehicles yet — add one below.</Text></Card>
          )}
          {mine.map((v, i) => {
            const row = rows[v.slug];
            const isEditing = editing === v.slug;
            return (
              <Animated.View key={v.slug} entering={FadeInDown.delay(i * 50)}>
                <Card style={{ borderColor: row.active ? c.border : c.surfaceHi, opacity: row.active ? 1 : 0.75 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: row.active ? c.brandSoft : c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name={CAT_ICONS[v.slug] ?? 'steering'} size={25} color={row.active ? c.brand : c.inkFaint} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>{v.name}</Text>
                      <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2, fontWeight: '600' }}>
                        {row.active ? 'Receiving requests' : 'Paused'}
                      </Text>
                    </View>
                    <Switch value={row.active} onValueChange={(val) => toggleActive(v.slug, val)} trackColor={{ true: c.online, false: c.borderStrong }} thumbColor={c.ink} />
                  </View>

                  {!isEditing ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: s.md, gap: s.sm }}>
                      <RatePill label="per km" value={row.price_per_km != null ? money(row.price_per_km) : null} />
                      <RatePill label="per day" value={row.price_per_day != null ? money(row.price_per_day) : null} />
                      <RatePill label="OT / hr" value={row.overtime_per_hour != null ? money(row.overtime_per_hour) : null} />
                      <Touch onPress={() => startEdit(v.slug)} hitSlop={8} style={{ marginLeft: 'auto' }}>
                        <Text style={{ color: c.brand, fontWeight: '800' }}>Edit</Text>
                      </Touch>
                    </View>
                  ) : (
                    <View style={{ marginTop: s.md, gap: s.sm }}>
                      <RateInputs draft={draft} setDraft={setDraft} />
                      <View style={{ flexDirection: 'row', gap: s.md }}>
                        <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1, height: 46 }} />
                        <Button label="Save rates" icon="checkmark" onPress={() => saveRates(v.slug)} loading={busy === v.slug} style={{ flex: 1.4, height: 46 }} />
                      </View>
                    </View>
                  )}
                </Card>
              </Animated.View>
            );
          })}
        </View>

        {/* Addable */}
        {addable.length > 0 && (
          <View style={{ gap: s.md }}>
            <Text style={[t.label, { color: c.inkFaint, paddingHorizontal: s.xs }]}>Your licence also allows</Text>
            {addable.map((v) => {
              const isEditing = editing === v.slug;
              return (
                <Card key={v.slug} style={{ borderStyle: 'dashed', borderColor: c.borderStrong }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name={CAT_ICONS[v.slug] ?? 'steering'} size={25} color={c.inkMuted} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16 }}>{v.name}</Text>
                      <Badge label="Licence verified" tone="online" icon="checkmark-circle" />
                    </View>
                    {!isEditing && (
                      <Touch onPress={() => startEdit(v.slug)} style={{ backgroundColor: c.brandSoft, borderRadius: r.pill, paddingHorizontal: 16, paddingVertical: 9 }}>
                        <Text style={{ color: c.brand, fontWeight: '800' }}>Add</Text>
                      </Touch>
                    )}
                  </View>
                  {isEditing && (
                    <View style={{ marginTop: s.md, gap: s.sm }}>
                      <RateInputs draft={draft} setDraft={setDraft} />
                      <View style={{ flexDirection: 'row', gap: s.md }}>
                        <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1, height: 46 }} />
                        <Button label="Start acting" icon="checkmark" onPress={() => saveRates(v.slug)} loading={busy === v.slug} style={{ flex: 1.4, height: 46 }} />
                      </View>
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function RatePill({ label, value }: { label: string; value: string | null }) {
  return (
    <View style={{ backgroundColor: c.surfaceAlt, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, alignItems: 'center' }}>
      <Text style={{ color: value ? c.ink : c.inkFaint, fontWeight: '800', fontSize: 13 }}>{value ?? '—'}</Text>
      <Text style={{ color: c.inkFaint, fontSize: 10, fontWeight: '600', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

function RateInputs({ draft, setDraft }: { draft: Draft; setDraft: (fn: (d: Draft) => Draft) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: s.sm }}>
      {(['perKm', 'perDay', 'overtime'] as const).map((f) => (
        <TextInput
          key={f}
          placeholder={f === 'perKm' ? '₹/km' : f === 'perDay' ? '₹/day' : '₹/hr OT'}
          placeholderTextColor={c.inkFaint}
          keyboardType="numeric"
          value={draft[f]}
          onChangeText={(val) => setDraft((d) => ({ ...d, [f]: val.replace(/[^\d.]/g, '') }))}
          style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: r.sm, paddingHorizontal: s.sm, paddingVertical: 11, color: c.ink, fontWeight: '700', backgroundColor: c.surfaceAlt, textAlign: 'center' }}
        />
      ))}
    </View>
  );
}

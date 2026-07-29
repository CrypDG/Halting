import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { effectiveStatus, expiringSoon, isHeavy, type DocType, type UserDoc } from '@/lib/documents';
import { c, r, s, type as t } from '@/lib/theme';
import { Badge, Card, Header, IconChip, Touch } from '@/lib/components';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  rider_insurance: 'shield-half-outline',
  health_insurance: 'medkit-outline',
  life_insurance: 'heart-outline',
  endorsement_cert: 'ribbon-outline',
  medical_fitness: 'fitness-outline',
};

export default function Documents() {
  const [types, setTypes] = useState<DocType[]>([]);
  const [docs, setDocs] = useState<Record<string, UserDoc>>({});
  const [licence, setLicence] = useState<{ number: string | null; classes: string[]; expiry: string | null; verified: string | null }>({ number: null, classes: [], expiry: null, verified: null });
  const [police, setPolice] = useState<{ expiry: string | null; verified: string | null }>({ expiry: null, verified: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    const uid = sess.session.user.id;
    const [{ data: ty }, { data: ud }, { data: dp }] = await Promise.all([
      supabase.from('document_types').select('*').eq('applies_to', 'driver').order('sort'),
      supabase.from('user_documents').select('*').eq('owner_id', uid),
      supabase.from('driver_profiles').select('license_number, license_classes, license_expiry, license_verified_at, police_cert_expiry, police_verified_at').eq('driver_id', uid).maybeSingle(),
    ]);
    setTypes((ty as DocType[]) ?? []);
    setDocs(Object.fromEntries(((ud as UserDoc[]) ?? []).map((d) => [d.doc_type, d])));
    if (dp) {
      setLicence({ number: dp.license_number, classes: dp.license_classes ?? [], expiry: dp.license_expiry, verified: dp.license_verified_at });
      setPolice({ expiry: dp.police_cert_expiry, verified: dp.police_verified_at });
    }
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const heavy = isHeavy(licence.classes);
  const visible = types.filter((ty) => !ty.heavy_only || heavy);
  const groups = [...new Set(visible.map((ty) => ty.category))];
  const missingRequired = visible.filter((ty) => ty.required && !docs[ty.slug]).length;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Documents" />
      <ScrollView
        contentContainerStyle={{ padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={c.inkMuted} />}
      >
        {missingRequired > 0 && (
          <Animated.View entering={FadeInDown} style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.warnSoft, borderRadius: r.md, padding: s.md }}>
            <Ionicons name="alert-circle" size={18} color={c.warn} />
            <Text style={{ color: c.warn, flex: 1, fontWeight: '700', fontSize: 13 }}>
              {missingRequired} required document{missingRequired > 1 ? 's' : ''} still to upload
            </Text>
          </Animated.View>
        )}

        {/* Verified by the platform — read-only */}
        <View>
          <Text style={[t.label, { color: c.inkFaint, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Identity & licence</Text>
          <Card style={{ gap: s.md }}>
            <VerifiedRow
              icon="card-outline"
              title="Driving licence"
              meta={licence.number ? `${licence.number} · ${licence.classes.join(', ')}` : '—'}
              expiry={licence.expiry}
              ok={!!licence.verified}
            />
            <View style={{ height: 1, backgroundColor: c.border }} />
            <VerifiedRow
              icon="shield-checkmark-outline"
              title="Police verification"
              meta="PVC / police clearance"
              expiry={police.expiry}
              ok={!!police.verified}
            />
          </Card>
          <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: s.sm, paddingHorizontal: s.xs, lineHeight: 18 }}>
            Verified during onboarding. Contact support to change these.
          </Text>
        </View>

        {/* Uploadable */}
        {groups.map((group, gi) => (
          <Animated.View key={group} entering={FadeInDown.delay(gi * 60)}>
            <Text style={[t.label, { color: c.inkFaint, marginBottom: s.sm, paddingHorizontal: s.xs }]}>{group}</Text>
            <Card style={{ padding: s.xs }}>
              {visible.filter((ty) => ty.category === group).map((ty, i, arr) => (
                <View key={ty.slug}>
                  <DocRow type={ty} doc={docs[ty.slug]} />
                  {i < arr.length - 1 && <View style={{ height: 1, backgroundColor: c.border, marginLeft: 66 }} />}
                </View>
              ))}
            </Card>
          </Animated.View>
        ))}

        <View style={{ flexDirection: 'row', gap: s.sm, paddingHorizontal: s.xs }}>
          <Ionicons name="information-circle-outline" size={16} color={c.inkFaint} />
          <Text style={{ color: c.inkFaint, fontSize: 12, flex: 1, lineHeight: 18 }}>
            We remind you 30/15/7/1 days before anything expires. Expired cover pauses your account until renewed.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

function VerifiedRow({ icon, title, meta, expiry, ok }: { icon: keyof typeof Ionicons.glyphMap; title: string; meta: string; expiry: string | null; ok: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
      <IconChip icon={icon} tint={ok ? c.verified : c.warn} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        <Text style={{ color: c.inkMuted, fontSize: 12, marginTop: 2 }}>{meta}</Text>
        {expiry ? <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 1 }}>Valid till {expiry}</Text> : null}
      </View>
      <Badge label={ok ? 'Verified' : 'Pending'} tone={ok ? 'online' : 'warn'} icon={ok ? 'checkmark-circle' : undefined} />
    </View>
  );
}

function DocRow({ type, doc }: { type: DocType; doc?: UserDoc }) {
  const st = doc ? effectiveStatus(doc) : null;
  const soon = doc ? expiringSoon(doc) : false;
  const tone = st === 'verified' ? (soon ? 'warn' : 'online') : st === 'rejected' || st === 'expired' ? 'danger' : st === 'pending' ? 'warn' : 'neutral';
  const label = !st ? 'Add' : st === 'verified' ? (soon ? 'Renew soon' : 'Verified') : st === 'pending' ? 'In review' : st === 'expired' ? 'Expired' : 'Rejected';
  const tint = st === 'verified' && !soon ? c.verified : st === 'rejected' || st === 'expired' ? c.danger : st ? c.warn : c.inkFaint;

  return (
    <Touch onPress={() => router.push({ pathname: '/document-upload', params: { type: type.slug } })} scaleTo={0.985}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md, padding: s.md }}>
        <IconChip icon={ICONS[type.slug] ?? 'document-text-outline'} tint={tint} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>{type.name}</Text>
            {type.required && !doc && <Text style={{ color: c.danger, fontSize: 11, fontWeight: '800' }}>REQUIRED</Text>}
          </View>
          <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {doc?.expires_on ? `Valid till ${doc.expires_on}` : type.hint ?? ''}
          </Text>
          {st === 'rejected' && doc?.rejection_reason ? (
            <Text style={{ color: c.danger, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{doc.rejection_reason}</Text>
          ) : null}
        </View>
        <Badge label={label} tone={tone as any} />
      </View>
    </Touch>
  );
}

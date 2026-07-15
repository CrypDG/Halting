import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { c, s, type as t } from '@/lib/theme';
import { Badge, Card, Header, IconChip } from '@/lib/components';

const HEAVY = ['HMV', 'HGMV', 'HPMV', 'HTV', 'PSV', 'CEV'];

type DP = {
  license_number: string | null; license_classes: string[]; license_expiry: string | null; license_verified_at: string | null;
  police_cert_expiry: string | null; police_verified_at: string | null;
};

function DocRow({ icon, title, meta, status, expiry, onPress }: { icon: keyof typeof Ionicons.glyphMap; title: string; meta: string; status: 'verified' | 'pending' | 'missing' | 'expiring'; expiry?: string | null; onPress?: () => void }) {
  const tone = status === 'verified' ? 'online' : status === 'expiring' ? 'warn' : status === 'missing' ? 'neutral' : 'warn';
  const label = status === 'verified' ? 'Verified' : status === 'expiring' ? 'Renew soon' : status === 'missing' ? 'Add' : 'Pending';
  return (
    <Card style={{ marginBottom: s.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
        <IconChip icon={icon} tint={status === 'verified' ? c.verified : status === 'missing' ? c.inkFaint : c.warn} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>{title}</Text>
          <Text style={{ color: c.inkMuted, fontSize: 13, marginTop: 2 }}>{meta}</Text>
          {expiry ? <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: 2 }}>Valid till {expiry}</Text> : null}
        </View>
        <Badge label={label} tone={tone as any} />
      </View>
    </Card>
  );
}

export default function Documents() {
  const [d, setD] = useState<DP | null>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    const { data } = await supabase.from('driver_profiles').select('license_number, license_classes, license_expiry, license_verified_at, police_cert_expiry, police_verified_at').eq('driver_id', sess.session.user.id).maybeSingle();
    setD(data as DP);
  }, []);
  useEffect(() => { load(); }, [load]);

  const isHeavy = (d?.license_classes ?? []).some((cl) => HEAVY.includes(cl));
  const soon = (iso: string | null) => (iso ? new Date(iso).getTime() - Date.now() < 30 * 864e5 : false);
  const add = (what: string) => Alert.alert(what, 'Document upload arrives in the next update.');

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Documents" />
      <ScrollView contentContainerStyle={{ padding: s.lg }}>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Required</Text>
        <DocRow icon="card-outline" title="Driving licence" meta={d?.license_number ? `${d.license_number} · ${d.license_classes?.join(', ')}` : '—'} status={d?.license_verified_at ? (soon(d.license_expiry) ? 'expiring' : 'verified') : 'pending'} expiry={d?.license_expiry} />
        <DocRow icon="shield-checkmark-outline" title="Police verification" meta="PVC / Police clearance" status={d?.police_verified_at ? (soon(d?.police_cert_expiry ?? null) ? 'expiring' : 'verified') : 'pending'} expiry={d?.police_cert_expiry} />
        <DocRow icon="document-attach-outline" title="Rider insurance" meta="Personal accident cover for trips" status="missing" onPress={() => add('Rider insurance')} />

        {isHeavy && (
          <>
            <Text style={[t.label, { color: c.inkMuted, marginTop: s.md, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Heavy-vehicle operators</Text>
            <DocRow icon="ribbon-outline" title="Endorsement certificate" meta="HTV / PSV / CEV as applicable" status="missing" onPress={() => add('Endorsement certificate')} />
            <DocRow icon="medkit-outline" title="Health & life insurance" meta="Recommended for heavy operators" status="missing" onPress={() => add('Health & life insurance')} />
          </>
        )}

        <View style={{ flexDirection: 'row', gap: s.sm, marginTop: s.sm, paddingHorizontal: s.xs }}>
          <Ionicons name="information-circle-outline" size={16} color={c.inkFaint} />
          <Text style={{ color: c.inkFaint, fontSize: 12, flex: 1, lineHeight: 18 }}>We remind you 30/15/7/1 days before any document expires. Driving on an expired licence auto-pauses that category.</Text>
        </View>
      </ScrollView>
    </View>
  );
}

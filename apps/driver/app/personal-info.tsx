import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { c, s, type as t } from '@/lib/theme';
import { Badge, Card, Header, MenuRow } from '@/lib/components';

type Info = { full_name: string | null; phone: string | null; email: string; masked_aadhaar: string | null; kyc_name: string | null; kyc_dob: string | null; kyc_verified_at: string | null };

export default function PersonalInfo() {
  const [d, setD] = useState<Info | null>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    const { data } = await supabase.from('profiles').select('full_name, phone, masked_aadhaar, kyc_name, kyc_dob, kyc_verified_at').eq('id', sess.session.user.id).maybeSingle();
    setD({ ...(data as any), email: sess.session.user.email ?? '—' });
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Personal info" right={<Text onPress={() => router.push('/profile-edit')} style={{ color: c.brand, fontWeight: '700' }}>Edit</Text>} />
      <ScrollView contentContainerStyle={{ padding: s.lg, gap: s.lg }}>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="person-outline" title="Name" subtitle={d?.full_name ?? '—'} />
          <MenuRow icon="call-outline" title="Phone" subtitle={d?.phone ?? '—'} />
          <MenuRow icon="mail-outline" title="Email" subtitle={d?.email ?? '—'} last />
        </Card>

        <View>
          <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Identity (from Aadhaar eKYC)</Text>
          <Card style={{ padding: 0 }}>
            <MenuRow icon="finger-print" tint={c.verified} title="Aadhaar" subtitle={d?.masked_aadhaar ?? 'Not verified'} right={<Badge label={d?.kyc_verified_at ? 'Verified' : 'Pending'} tone={d?.kyc_verified_at ? 'online' : 'warn'} icon={d?.kyc_verified_at ? 'checkmark-circle' : undefined} />} />
            <MenuRow icon="id-card-outline" tint={c.verified} title="Legal name" subtitle={d?.kyc_name ?? '—'} />
            <MenuRow icon="calendar-outline" tint={c.verified} title="Date of birth" subtitle={d?.kyc_dob ?? '—'} last />
          </Card>
          <Text style={{ color: c.inkFaint, fontSize: 12, marginTop: s.sm, paddingHorizontal: s.xs, lineHeight: 18 }}>
            Your Aadhaar number is never stored in full — only the masked value and a verification token, per the DPDP Act.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

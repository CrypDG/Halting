import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { c, s, type as t } from '@/lib/theme';
import { Avatar, Badge, Card, MenuRow, ScreenHeader } from '@/lib/components';

type Data = {
  full_name: string | null; photo_url: string | null; created_at: string; kyc_verified_at: string | null;
  rating_avg: number | null; trips_completed: number; license_classes: string[];
  license_verified_at: string | null; police_verified_at: string | null;
};

export default function Account() {
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Data | null>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    const id = sess.session.user.id;
    const [{ data: p }, { data: dp }] = await Promise.all([
      supabase.from('profiles').select('full_name, photo_url, created_at, kyc_verified_at').eq('id', id).maybeSingle(),
      supabase.from('driver_profiles').select('rating_avg, trips_completed, license_classes, license_verified_at, police_verified_at').eq('driver_id', id).maybeSingle(),
    ]);
    setD({ ...(p as any), ...(dp as any) });
  }, []);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load])); // refresh after editing profile

  function signOut() {
    Alert.alert('Sign out?', 'You’ll need to sign in again to go online.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); router.replace('/login'); } },
    ]);
  }

  if (!d) return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.inkMuted }}>Loading…</Text></View>;

  const memberSince = d.created_at ? new Date(d.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';
  const allVerified = d.kyc_verified_at && d.license_verified_at && d.police_verified_at;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + s.md, padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Account" />

      {/* Profile — tap to edit */}
      <Pressable onPress={() => router.push('/profile-edit')} style={({ pressed }) => pressed && { opacity: 0.7 }}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
            <Avatar name={d.full_name ?? 'Driver'} uri={d.photo_url} size={58} />
            <View style={{ flex: 1 }}>
              <Text style={[t.h2, { color: c.ink }]} numberOfLines={1}>{d.full_name ?? 'Driver'}</Text>
              <Text style={{ color: c.inkMuted, fontSize: 13, marginTop: 2 }}>Member since {memberSince}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={c.inkFaint} />
          </View>
          <View style={{ flexDirection: 'row', gap: s.sm, marginTop: s.lg }}>
            {[['star', d.rating_avg ? d.rating_avg.toFixed(1) : '—', 'Rating'], ['navigate', String(d.trips_completed), 'Trips'], ['card', d.license_classes?.join(', ') || '—', 'Licence']].map(([_ic, val, lbl]) => (
              <View key={lbl} style={{ flex: 1, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: s.md }}>
                <Text style={{ fontWeight: '800', fontSize: lbl === 'Licence' ? 13 : 18, color: c.ink }} numberOfLines={1}>{val}</Text>
                <Text style={{ color: c.inkFaint, fontSize: 11, marginTop: 2 }}>{lbl}</Text>
              </View>
            ))}
          </View>
        </Card>
      </Pressable>

      {/* Account */}
      <View>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Account</Text>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="person-outline" tint={c.brand} title="Personal info" subtitle="Name, phone, identity" onPress={() => router.push('/personal-info')} />
          <MenuRow icon="car-sport-outline" tint={c.brand} title="Vehicles & rates" subtitle="What you act as, and your pricing" onPress={() => router.push('/vehicles')} />
          <MenuRow icon="document-text-outline" tint={c.gold} title="Documents" subtitle="Licence, police, insurance" onPress={() => router.push('/documents')} />
          <MenuRow icon="wallet-outline" tint={c.online} title="Payouts & bank" subtitle="Where fares are settled" onPress={() => router.push('/payout')} last />
        </Card>
      </View>

      {/* Verification */}
      <View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: s.sm, paddingHorizontal: s.xs }}>
          <Text style={[t.label, { color: c.inkMuted }]}>Verification</Text>
          {allVerified ? <Badge label="Fully verified" tone="online" icon="checkmark-circle" /> : null}
        </View>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="finger-print" tint={c.verified} title="Aadhaar eKYC" right={<Badge label={d.kyc_verified_at ? 'Verified' : 'Pending'} tone={d.kyc_verified_at ? 'online' : 'warn'} icon={d.kyc_verified_at ? 'checkmark-circle' : undefined} />} />
          <MenuRow icon="card-outline" tint={c.verified} title="Driving licence" right={<Badge label={d.license_verified_at ? 'Verified' : 'Pending'} tone={d.license_verified_at ? 'online' : 'warn'} icon={d.license_verified_at ? 'checkmark-circle' : undefined} />} />
          <MenuRow icon="shield-checkmark-outline" tint={c.verified} title="Police verification" right={<Badge label={d.police_verified_at ? 'Verified' : 'Pending'} tone={d.police_verified_at ? 'online' : 'warn'} icon={d.police_verified_at ? 'checkmark-circle' : undefined} />} last />
        </Card>
      </View>

      {/* Preferences */}
      <View>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Preferences</Text>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="settings-outline" tint={c.steel} title="Settings" subtitle="Notifications, security, language" onPress={() => router.push('/settings')} />
          <MenuRow icon="help-buoy-outline" tint={c.brand} title="Help & support" onPress={() => router.push('/help')} last />
        </Card>
      </View>

      <Card style={{ padding: 0 }}>
        <MenuRow icon="log-out-outline" title="Sign out" danger onPress={signOut} last />
      </Card>

      <View style={{ alignItems: 'center', paddingTop: s.sm }}>
        <Text style={{ color: c.inkFaint, fontSize: 12 }}>Acting Driver · v0.1.0</Text>
      </View>
    </ScrollView>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { authenticate, biometricAvailable, biometricLabel, isBiometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { c, s, type as t } from '@/lib/theme';
import { Avatar, Badge, Card, MenuRow, ScreenHeader } from '@/lib/components';

type Data = {
  full_name: string | null; created_at: string; masked_aadhaar: string | null; kyc_verified_at: string | null;
  rating_avg: number | null; trips_completed: number; license_classes: string[]; license_number: string | null;
  license_expiry: string | null; license_verified_at: string | null; police_verified_at: string | null;
  upi_or_account: string | null;
};

export default function Account() {
  const insets = useSafeAreaInsets();
  const [d, setD] = useState<Data | null>(null);
  const [bioAvail, setBioAvail] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioLabel, setBioLabel] = useState('Fingerprint');
  const [notif, setNotif] = useState(true);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    const id = sess.session.user.id;
    const [{ data: p }, { data: dp }] = await Promise.all([
      supabase.from('profiles').select('full_name, created_at, masked_aadhaar, kyc_verified_at').eq('id', id).maybeSingle(),
      supabase.from('driver_profiles').select('rating_avg, trips_completed, license_classes, license_number, license_expiry, license_verified_at, police_verified_at, upi_or_account').eq('driver_id', id).maybeSingle(),
    ]);
    setD({ ...(p as any), ...(dp as any) });
    setBioAvail(await biometricAvailable());
    setBioOn(await isBiometricEnabled());
    setBioLabel(await biometricLabel());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleBio(v: boolean) {
    if (v) {
      const ok = await authenticate(`Confirm ${bioLabel} to enable app lock`);
      if (!ok) return;
      await setBiometricEnabled(true);
      setBioOn(true);
    } else {
      await setBiometricEnabled(false);
      setBioOn(false);
    }
  }

  function signOut() {
    Alert.alert('Sign out?', 'You’ll need to sign in again to go online.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await supabase.auth.signOut(); router.replace('/login'); } },
    ]);
  }

  if (!d) {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.inkMuted }}>Loading…</Text></View>;
  }

  const memberSince = d.created_at ? new Date(d.created_at).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '';

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + s.md, padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Account" />

      {/* Profile */}
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
          <Avatar name={d.full_name ?? 'Driver'} size={58} />
          <View style={{ flex: 1 }}>
            <Text style={[t.h2, { color: c.ink }]} numberOfLines={1}>{d.full_name ?? 'Driver'}</Text>
            <Text style={{ color: c.inkMuted, fontSize: 13, marginTop: 2 }}>Member since {memberSince}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: s.sm, marginTop: s.lg }}>
          <View style={{ flex: 1, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: s.md }}>
            <Text style={{ fontWeight: '800', fontSize: 18, color: c.ink }}>{d.rating_avg ? d.rating_avg.toFixed(1) : '—'}</Text>
            <Text style={{ color: c.inkFaint, fontSize: 11, marginTop: 2 }}>Rating</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: s.md }}>
            <Text style={{ fontWeight: '800', fontSize: 18, color: c.ink }}>{d.trips_completed}</Text>
            <Text style={{ color: c.inkFaint, fontSize: 11, marginTop: 2 }}>Trips</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', backgroundColor: c.surfaceAlt, borderRadius: 12, paddingVertical: s.md }}>
            <Text style={{ fontWeight: '800', fontSize: 13, color: c.ink }} numberOfLines={1}>{d.license_classes?.join(', ') || '—'}</Text>
            <Text style={{ color: c.inkFaint, fontSize: 11, marginTop: 2 }}>Licence</Text>
          </View>
        </View>
      </Card>

      {/* Verification */}
      <View>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Verification</Text>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="finger-print" tint={c.verified} title="Aadhaar eKYC" subtitle={d.masked_aadhaar ?? 'Not verified'} right={<Badge label={d.kyc_verified_at ? 'Verified' : 'Pending'} tone={d.kyc_verified_at ? 'online' : 'warn'} icon={d.kyc_verified_at ? 'checkmark-circle' : undefined} />} />
          <MenuRow icon="card-outline" tint={c.verified} title="Driving licence" subtitle={d.license_number ? `${d.license_number} · exp ${d.license_expiry ?? '—'}` : 'Not verified'} right={<Badge label={d.license_verified_at ? 'Verified' : 'Pending'} tone={d.license_verified_at ? 'online' : 'warn'} icon={d.license_verified_at ? 'checkmark-circle' : undefined} />} />
          <MenuRow icon="shield-checkmark-outline" tint={c.verified} title="Police verification" subtitle={d.police_verified_at ? 'Cleared' : 'Pending review'} right={<Badge label={d.police_verified_at ? 'Verified' : 'Pending'} tone={d.police_verified_at ? 'online' : 'warn'} icon={d.police_verified_at ? 'checkmark-circle' : undefined} />} last />
        </Card>
      </View>

      {/* Settings */}
      <View>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Settings</Text>
        <Card style={{ padding: 0 }}>
          {bioAvail && (
            <MenuRow icon="finger-print" tint={c.brand} title={`Unlock with ${bioLabel}`} subtitle="Require biometric to open the app" toggle={{ value: bioOn, onValueChange: toggleBio }} />
          )}
          <MenuRow icon="notifications-outline" tint={c.gold} title="Notifications" subtitle="Requests, payments, alerts" toggle={{ value: notif, onValueChange: setNotif }} />
          <MenuRow icon="language-outline" tint={c.steel} title="Language" subtitle="English" onPress={() => Alert.alert('Language', 'Tamil and Hindi are coming soon.')} />
          <MenuRow icon="wallet-outline" tint={c.online} title="Payout details" subtitle={d.upi_or_account ?? 'Not set'} onPress={() => Alert.alert('Payout details', 'Editing payout details is coming in the next update.')} last />
        </Card>
      </View>

      <View>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="log-out-outline" title="Sign out" danger onPress={signOut} last />
        </Card>
      </View>

      <View style={{ alignItems: 'center', paddingTop: s.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="shield-checkmark" size={14} color={c.inkFaint} />
          <Text style={{ color: c.inkFaint, fontSize: 12 }}>Acting Driver · v0.1.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}

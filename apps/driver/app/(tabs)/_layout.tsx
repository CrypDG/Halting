import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Redirect, Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { authenticate, biometricAvailable, biometricLabel, isBiometricEnabled } from '@/lib/biometric';
import { c, s, type as t } from '@/lib/theme';
import { Button, IconChip } from '@/lib/components';

type Gate = 'loading' | 'noauth' | 'pending' | 'locked' | 'ok';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const [gate, setGate] = useState<Gate>('loading');
  const [label, setLabel] = useState('Fingerprint');

  const evaluate = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return setGate('noauth');
    const { data: dp } = await supabase.from('driver_profiles').select('status').eq('driver_id', data.session.user.id).maybeSingle();
    if (dp?.status !== 'approved') return setGate('pending');
    if ((await isBiometricEnabled()) && (await biometricAvailable())) {
      setLabel(await biometricLabel());
      return setGate('locked');
    }
    setGate('ok');
  }, []);

  useEffect(() => { evaluate(); }, [evaluate]);

  if (gate === 'loading') {
    return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.inkMuted }}>Loading…</Text></View>;
  }
  if (gate === 'noauth') return <Redirect href="/login" />;
  if (gate === 'pending') return <Redirect href="/pending" />;
  if (gate === 'locked') return <BiometricLock label={label} onUnlock={() => setGate('ok')} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.ink,
        tabBarInactiveTintColor: c.inkFaint,
        tabBarStyle: {
          backgroundColor: c.surface,
          borderTopColor: c.border,
          height: 58 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom || 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} /> }} />
      <Tabs.Screen name="activity" options={{ title: 'Activity', tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="services" options={{ title: 'Services', tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}

function BiometricLock({ label, onUnlock }: { label: string; onUnlock: () => void }) {
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const tryUnlock = useCallback(async () => {
    setBusy(true);
    setFailed(false);
    const ok = await authenticate('Unlock Acting Driver');
    setBusy(false);
    if (ok) onUnlock();
    else setFailed(true);
  }, [onUnlock]);

  useEffect(() => { tryUnlock(); }, [tryUnlock]);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: s.xl, gap: s.lg }}>
      <IconChip icon="finger-print" tint={c.brand} />
      <Text style={[t.h1, { color: c.ink, textAlign: 'center' }]}>Locked</Text>
      <Text style={{ color: c.inkMuted, textAlign: 'center', maxWidth: 280, lineHeight: 22 }}>
        {failed ? `${label} not recognised. Try again to continue.` : `Verify with ${label} to open Acting Driver.`}
      </Text>
      <Button label={`Unlock with ${label}`} icon="finger-print" onPress={tryUnlock} loading={busy} style={{ alignSelf: 'stretch' }} />
      <Pressable onPress={async () => { await supabase.auth.signOut(); router.replace('/login'); }}>
        <Text style={{ color: c.inkFaint, fontWeight: '600' }}>Sign out instead</Text>
      </Pressable>
    </View>
  );
}

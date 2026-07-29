import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { c, s, type as t } from '@/lib/theme';
import { authenticate, biometricAvailable, biometricLabel, isBiometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { Card, Header, MenuRow, SelectSheet } from '@/lib/components';

const PREFS = { push: 'acting.notif.push', sms: 'acting.notif.sms', promo: 'acting.notif.promo' };
const LANGS = [
  { key: 'en', label: 'English', sublabel: 'Default' },
  { key: 'ta', label: 'தமிழ்', sublabel: 'Tamil — translation coming soon' },
  { key: 'hi', label: 'हिन्दी', sublabel: 'Hindi — translation coming soon' },
];

export default function Settings() {
  const [push, setPush] = useState(true);
  const [sms, setSms] = useState(true);
  const [promo, setPromo] = useState(false);
  const [lang, setLang] = useState('en');
  const [langOpen, setLangOpen] = useState(false);
  const [bioAvail, setBioAvail] = useState(false);
  const [bioOn, setBioOn] = useState(false);
  const [bioLabel, setBioLabel] = useState('Fingerprint');

  const load = useCallback(async () => {
    setPush((await AsyncStorage.getItem(PREFS.push)) !== '0');
    setSms((await AsyncStorage.getItem(PREFS.sms)) !== '0');
    setPromo((await AsyncStorage.getItem(PREFS.promo)) === '1');
    setLang((await AsyncStorage.getItem('acting.lang')) ?? 'en');
    setBioAvail(await biometricAvailable());
    setBioOn(await isBiometricEnabled());
    setBioLabel(await biometricLabel());
  }, []);
  useEffect(() => { load(); }, [load]);

  const persist = (key: string, on: boolean, setter: (v: boolean) => void) => { setter(on); AsyncStorage.setItem(key, on ? '1' : '0'); };

  async function toggleBio(v: boolean) {
    if (v) { if (!(await authenticate(`Confirm ${bioLabel}`))) return; await setBiometricEnabled(true); setBioOn(true); }
    else { await setBiometricEnabled(false); setBioOn(false); }
  }

  const langLabel = LANGS.find((l) => l.key === lang)?.label ?? 'English';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Settings" />
      <ScrollView contentContainerStyle={{ padding: s.lg, gap: s.lg }}>
        <View>
          <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Notifications</Text>
          <Card style={{ padding: 0 }}>
            <MenuRow icon="notifications-outline" tint={c.gold} title="Push notifications" subtitle="Trip requests, arrivals, payments" toggle={{ value: push, onValueChange: (v) => persist(PREFS.push, v, setPush) }} />
            <MenuRow icon="chatbox-outline" tint={c.brand} title="SMS alerts" subtitle="Fallback when offline" toggle={{ value: sms, onValueChange: (v) => persist(PREFS.sms, v, setSms) }} />
            <MenuRow icon="pricetag-outline" tint={c.online} title="Offers & tips" subtitle="Occasional promotional messages" toggle={{ value: promo, onValueChange: (v) => persist(PREFS.promo, v, setPromo) }} last />
          </Card>
        </View>

        <View>
          <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Security</Text>
          <Card style={{ padding: 0 }}>
            {bioAvail && <MenuRow icon="finger-print" tint={c.brand} title={`App lock · ${bioLabel}`} subtitle="Locks this app only — not a driver identity check" toggle={{ value: bioOn, onValueChange: toggleBio }} />}
            <MenuRow icon="lock-closed-outline" tint={c.steel} title="Change password" onPress={() => Alert.alert('Change password', 'Password reset via email is coming soon.')} last />
          </Card>
        </View>

        <View>
          <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>App</Text>
          <Card style={{ padding: 0 }}>
            <MenuRow icon="language-outline" tint={c.brand} title="Language" subtitle={langLabel} onPress={() => setLangOpen(true)} />
            <MenuRow icon="document-text-outline" tint={c.steel} title="Terms & privacy" onPress={() => Alert.alert('Legal', 'Terms of Service and Privacy Policy will open in your browser.')} />
            <MenuRow icon="information-circle-outline" tint={c.steel} title="About Acting" subtitle="Version 0.1.0" onPress={() => Alert.alert('Acting Driver', 'Version 0.1.0\nBuilt in Tamil Nadu.')} last />
          </Card>
        </View>
      </ScrollView>

      <SelectSheet
        visible={langOpen}
        title="Language"
        options={LANGS.map((l) => ({ key: l.key, label: l.label, sublabel: l.sublabel, icon: 'language-outline' as const }))}
        value={lang}
        onSelect={(key) => { setLang(key); AsyncStorage.setItem('acting.lang', key); }}
        onClose={() => setLangOpen(false)}
      />
    </View>
  );
}

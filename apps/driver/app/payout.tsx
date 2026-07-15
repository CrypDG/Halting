import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mockPaymentGateway } from '@acting/shared';
import { supabase } from '@/lib/supabase';
import { c, s } from '@/lib/theme';
import { Button, Card, FormField, Header, IconChip } from '@/lib/components';

export default function Payout() {
  const [uid, setUid] = useState<string | null>(null);
  const [upi, setUpi] = useState('');
  const [verified, setVerified] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    setUid(sess.session.user.id);
    const { data } = await supabase.from('driver_profiles').select('upi_or_account, payout_verified_at').eq('driver_id', sess.session.user.id).maybeSingle();
    setUpi(data?.upi_or_account ?? '');
    setVerified(data?.payout_verified_at ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!uid) return;
    setBusy(true); setErr(null);
    try {
      const ok = await mockPaymentGateway.verifyPayout({ upiOrAccount: upi.trim() });
      if (!ok) throw new Error('Could not verify this account. Check and try again.');
      const { error } = await supabase.from('driver_profiles').update({ upi_or_account: upi.trim(), payout_verified_at: new Date().toISOString() }).eq('driver_id', uid);
      if (error) throw error;
      Alert.alert('Payout updated', 'Your fares will be settled to this account.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Payouts & bank" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: s.lg, gap: s.lg }} keyboardShouldPersistTaps="handled">
          <Card>
            <View style={{ flexDirection: 'row', gap: s.md, alignItems: 'center' }}>
              <IconChip icon="wallet-outline" tint={c.online} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>Where you get paid</Text>
                <Text style={{ color: c.inkMuted, fontSize: 13, marginTop: 2 }}>In-app fares settle here T+1, minus any dues.</Text>
              </View>
            </View>
          </Card>

          <FormField label="UPI ID or account number" placeholder="yourname@upi" autoCapitalize="none" value={upi} onChangeText={setUpi} hint={verified ? 'Verified by penny-drop.' : 'We verify with a ₹1 penny-drop.'} />

          {err && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: 12, padding: s.md }}>
              <Ionicons name="alert-circle" size={18} color={c.danger} />
              <Text style={{ color: c.danger, flex: 1, fontWeight: '600' }}>{err}</Text>
            </View>
          )}

          <Button label="Verify & save" icon="shield-checkmark" onPress={save} loading={busy} disabled={!upi.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

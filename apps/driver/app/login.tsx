import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { authenticate, biometricAvailable, biometricLabel, isBiometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { c, r, s, type as t } from '@/lib/theme';
import { Button } from '@/lib/components';

/** After a password sign-in, offer to turn on biometric unlock for next time. */
async function offerBiometric() {
  if (await isBiometricEnabled()) return;
  if (!(await biometricAvailable())) return;
  const label = await biometricLabel();
  await new Promise<void>((resolve) => {
    Alert.alert(`Unlock with ${label}?`, `Use ${label} to open Acting Driver next time instead of your password.`, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve() },
      {
        text: `Enable ${label}`,
        onPress: async () => {
          if (await authenticate(`Confirm ${label}`)) await setBiometricEnabled(true);
          resolve();
        },
      },
    ]);
  });
}

function Field({ icon, ...props }: { icon: keyof typeof Ionicons.glyphMap } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, borderWidth: 1.5, borderColor: c.border, borderRadius: r.md, paddingHorizontal: s.md, backgroundColor: c.surface }}>
      <Ionicons name={icon} size={19} color={c.inkFaint} />
      <TextInput
        placeholderTextColor={c.inkFaint}
        style={{ flex: 1, paddingVertical: 15, fontSize: 16, color: c.ink }}
        {...props}
      />
    </View>
  );
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { role: 'driver', full_name: name } } });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await offerBiometric();
      }
      router.replace('/');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: s.xl, paddingTop: insets.top + s.xxxl }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center', marginBottom: s.xxxl }}>
          <View style={{ width: 68, height: 68, borderRadius: 20, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="steering" size={36} color={c.onInk} />
          </View>
          <Text style={[t.display, { color: c.ink, marginTop: s.lg }]}>Acting Driver</Text>
          <Text style={{ color: c.inkMuted, marginTop: 4 }}>
            {mode === 'signin' ? 'Sign in to start driving' : 'Create your driver account'}
          </Text>
        </View>

        <View style={{ gap: s.md }}>
          {mode === 'signup' && <Field icon="person-outline" placeholder="Full name" value={name} onChangeText={setName} />}
          <Field icon="mail-outline" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, borderWidth: 1.5, borderColor: c.border, borderRadius: r.md, paddingHorizontal: s.md, backgroundColor: c.surface }}>
            <Ionicons name="lock-closed-outline" size={19} color={c.inkFaint} />
            <TextInput placeholder="Password" placeholderTextColor={c.inkFaint} secureTextEntry={!showPw} value={password} onChangeText={setPassword} style={{ flex: 1, paddingVertical: 15, fontSize: 16, color: c.ink }} />
            <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={10}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={c.inkFaint} />
            </Pressable>
          </View>

          {error && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.md }}>
              <Ionicons name="alert-circle" size={18} color={c.danger} />
              <Text style={{ color: c.danger, flex: 1, fontWeight: '600' }}>{error}</Text>
            </View>
          )}

          <Button label={mode === 'signin' ? 'Sign in' : 'Create account'} onPress={submit} loading={busy} style={{ marginTop: s.sm }} />
        </View>

        <Pressable onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }} style={{ marginTop: s.xl }}>
          <Text style={{ color: c.inkMuted, textAlign: 'center' }}>
            {mode === 'signin' ? 'New driver?  ' : 'Already registered?  '}
            <Text style={{ color: c.brand, fontWeight: '700' }}>{mode === 'signin' ? 'Create an account' : 'Sign in'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

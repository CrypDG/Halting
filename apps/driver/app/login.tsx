import { useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { requestOtp, verifyOtp } from '@/lib/phoneAuth';
import { authenticate, biometricAvailable, biometricLabel, isBiometricEnabled, setBiometricEnabled } from '@/lib/biometric';
import { c, r, s, type as t } from '@/lib/theme';
import { Button, Touch } from '@/lib/components';

/** After first successful sign-in, offer biometric unlock for next time. */
async function offerBiometric() {
  if (await isBiometricEnabled()) return;
  if (!(await biometricAvailable())) return;
  const label = await biometricLabel();
  await new Promise<void>((resolve) => {
    Alert.alert(`Unlock with ${label}?`, `Use ${label} to open Acting Driver next time.`, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve() },
      { text: `Enable ${label}`, onPress: async () => { if (await authenticate(`Confirm ${label}`)) await setBiometricEnabled(true); resolve(); } },
    ]);
  });
}

export default function Login() {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'phone' | 'otp' | 'email'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const otpRef = useRef<TextInput>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const iv = setInterval(() => setResendIn((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(iv);
  }, [resendIn]);

  const phoneOk = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').slice(-10));

  async function sendCode() {
    setBusy(true); setError(null);
    try {
      const dev = await requestOtp(phone);
      setDevOtp(dev);
      setCode('');
      setStep('otp');
      setResendIn(30);
      setTimeout(() => otpRef.current?.focus(), 350);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not send the code'); }
    finally { setBusy(false); }
  }

  async function submitCode(value?: string) {
    const codeToUse = value ?? code;
    if (codeToUse.length !== 6) return;
    setBusy(true); setError(null);
    try {
      await verifyOtp(phone, codeToUse);
      await offerBiometric();
      router.replace('/');
    } catch (e) { setError(e instanceof Error ? e.message : 'Verification failed'); }
    finally { setBusy(false); }
  }

  async function emailSignIn() {
    setBusy(true); setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await offerBiometric();
      router.replace('/');
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed'); }
    finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: s.xl, paddingTop: insets.top + s.xxxl }} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.springify().damping(18)} style={{ alignItems: 'center', marginBottom: s.xxxl }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="steering" size={40} color={c.onInk} />
          </View>
          <Text style={[t.h1, { color: c.ink, marginTop: s.lg }]}>Acting Driver</Text>
          <Text style={{ color: c.inkMuted, marginTop: 4, fontWeight: '500' }}>
            {step === 'phone' && 'Sign in or join with your mobile number'}
            {step === 'otp' && `Code sent to +91 ${phone.replace(/\D/g, '').slice(-10)}`}
            {step === 'email' && 'Developer sign-in'}
          </Text>
        </Animated.View>

        {step === 'phone' && (
          <Animated.View entering={FadeInUp.delay(80)} style={{ gap: s.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, borderWidth: 1, borderColor: c.border, borderRadius: r.md, paddingHorizontal: s.md, backgroundColor: c.surfaceAlt }}>
              <Text style={{ color: c.ink, fontSize: 16, fontWeight: '700' }}>+91</Text>
              <View style={{ width: 1, height: 22, backgroundColor: c.borderStrong }} />
              <TextInput
                placeholder="Mobile number"
                placeholderTextColor={c.inkFaint}
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={(v) => setPhone(v.replace(/\D/g, ''))}
                style={{ flex: 1, paddingVertical: 16, fontSize: 17, color: c.ink, fontWeight: '700', letterSpacing: 1 }}
              />
            </View>
            {error && <ErrorBar text={error} />}
            <Button label="Get OTP" icon="chatbox-ellipses" onPress={sendCode} loading={busy} disabled={!phoneOk} />
            <Text style={{ color: c.inkFaint, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
              We'll text you a 6-digit code. New numbers create an Acting driver account.
            </Text>
          </Animated.View>
        )}

        {step === 'otp' && (
          <Animated.View entering={FadeInUp} style={{ gap: s.md }}>
            <TextInput
              ref={otpRef}
              value={code}
              onChangeText={(v) => {
                const clean = v.replace(/\D/g, '').slice(0, 6);
                setCode(clean);
                if (clean.length === 6) submitCode(clean);
              }}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="––––––"
              placeholderTextColor={c.inkFaint}
              style={{ borderWidth: 1, borderColor: c.border, borderRadius: r.md, textAlign: 'center', fontSize: 30, letterSpacing: 12, paddingVertical: s.lg, color: c.ink, fontWeight: '800', backgroundColor: c.surfaceAlt }}
            />
            {devOtp && (
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Ionicons name="construct-outline" size={14} color={c.warn} />
                <Text style={{ color: c.warn, fontSize: 13, fontWeight: '700' }}>Dev build — your code is {devOtp}</Text>
              </View>
            )}
            {error && <ErrorBar text={error} />}
            <Button label="Verify & continue" icon="checkmark" onPress={() => submitCode()} loading={busy} disabled={code.length !== 6} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Touch onPress={() => { setStep('phone'); setError(null); }} hitSlop={8}>
                <Text style={{ color: c.inkMuted, fontWeight: '700' }}>Change number</Text>
              </Touch>
              {resendIn > 0 ? (
                <Text style={{ color: c.inkFaint, fontWeight: '600' }}>Resend in {resendIn}s</Text>
              ) : (
                <Touch onPress={sendCode} hitSlop={8}>
                  <Text style={{ color: c.brand, fontWeight: '800' }}>Resend code</Text>
                </Touch>
              )}
            </View>
          </Animated.View>
        )}

        {step === 'email' && (
          <Animated.View entering={FadeInUp} style={{ gap: s.md }}>
            <Field icon="mail-outline" placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
            <Field icon="lock-closed-outline" placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} />
            {error && <ErrorBar text={error} />}
            <Button label="Sign in" onPress={emailSignIn} loading={busy} disabled={!email || !password} />
          </Animated.View>
        )}

        <Touch
          onPress={() => { setStep(step === 'email' ? 'phone' : 'email'); setError(null); }}
          style={{ marginTop: s.xxl, alignSelf: 'center' }}
          hitSlop={8}
        >
          <Text style={{ color: c.inkFaint, fontWeight: '600', fontSize: 13 }}>
            {step === 'email' ? '← Back to mobile OTP' : 'Team member? Sign in with email'}
          </Text>
        </Touch>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ icon, ...props }: { icon: keyof typeof Ionicons.glyphMap } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, borderWidth: 1, borderColor: c.border, borderRadius: r.md, paddingHorizontal: s.md, backgroundColor: c.surfaceAlt }}>
      <Ionicons name={icon} size={19} color={c.inkFaint} />
      <TextInput placeholderTextColor={c.inkFaint} style={{ flex: 1, paddingVertical: 15, fontSize: 16, color: c.ink, fontWeight: '600' }} {...props} />
    </View>
  );
}

function ErrorBar({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.md }}>
      <Ionicons name="alert-circle" size={18} color={c.danger} />
      <Text style={{ color: c.danger, flex: 1, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

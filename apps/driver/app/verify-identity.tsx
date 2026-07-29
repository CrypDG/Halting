import { useEffect, useState } from 'react';
import { Image, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { Easing, FadeIn, FadeInUp, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { captureSelfie, randomLivenessAction, submitIdentitySelfie } from '@/lib/identity';
import { c, r, s, shadow, type as t } from '@/lib/theme';
import { Button, Card, Header, Touch } from '@/lib/components';

/**
 * Per-trip driver identity check (PRD §3.4). This is the control that actually
 * answers "is the verified person driving?" — device fingerprint cannot.
 */
export default function VerifyIdentity() {
  const { trip, category, reason } = useLocalSearchParams<{ trip?: string; category?: string; reason?: string }>();
  const [prompt] = useState(randomLivenessAction);
  const [shot, setShot] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [held, setHeld] = useState(false);

  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.out(Easing.ease) }), -1, false);
  }, [pulse]);
  const ring = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse.value * 0.18 }],
    opacity: 0.5 * (1 - pulse.value),
  }));

  async function take() {
    setErr(null);
    try {
      const b64 = await captureSelfie();
      if (b64) setShot(b64);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open the camera'); }
  }

  async function submit() {
    if (!shot) return;
    setBusy(true); setErr(null);
    try {
      const res = await submitIdentitySelfie({ tripId: trip, category, base64: shot });
      if (res.held) { setHeld(true); return; }
      if (res.passed) { router.back(); return; }
      setShot(null);
      setErr(res.message ?? 'That didn’t match. Try again in good light.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Verification failed'); }
    finally { setBusy(false); }
  }

  if (held) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Header title="Account on hold" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: s.xl, gap: s.lg }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="lock-closed" size={34} color={c.danger} />
          </View>
          <Text style={[t.h1, { color: c.ink, textAlign: 'center' }]}>Account on hold</Text>
          <Text style={{ color: c.inkMuted, textAlign: 'center', lineHeight: 22, maxWidth: 300, fontWeight: '500' }}>
            Several face checks didn’t match your registered photo, so we’ve paused your account. Our team will review it — contact support to sort this out.
          </Text>
          <Button label="Contact support" icon="help-buoy" onPress={() => router.replace('/help')} style={{ alignSelf: 'stretch' }} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Confirm it's you" />
      <View style={{ flex: 1, padding: s.lg, gap: s.lg }}>
        {reason ? (
          <Animated.View entering={FadeIn} style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.brandSoft, borderRadius: r.md, padding: s.md }}>
            <Ionicons name="shield-checkmark" size={18} color={c.brand} />
            <Text style={{ color: c.brand, flex: 1, fontWeight: '700', fontSize: 13 }}>{reason}</Text>
          </Animated.View>
        ) : null}

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: s.xl }}>
          <View style={{ alignItems: 'center', justifyContent: 'center' }}>
            {!shot && <Animated.View style={[{ position: 'absolute', width: 210, height: 210, borderRadius: 105, backgroundColor: c.brand }, ring]} pointerEvents="none" />}
            <View style={[{ width: 210, height: 210, borderRadius: 105, overflow: 'hidden', backgroundColor: c.surfaceAlt, borderWidth: 3, borderColor: shot ? c.online : c.brand, alignItems: 'center', justifyContent: 'center' }, shadow.hero]}>
              {shot ? (
                <Image source={{ uri: `data:image/jpeg;base64,${shot}` }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (
                <Ionicons name="person" size={92} color={c.inkFaint} />
              )}
            </View>
          </View>

          <Animated.View entering={FadeInUp} style={{ alignItems: 'center', gap: s.sm }}>
            <Text style={[t.h2, { color: c.ink, textAlign: 'center' }]}>{shot ? 'Looks good?' : prompt}</Text>
            <Text style={{ color: c.inkMuted, textAlign: 'center', maxWidth: 300, lineHeight: 21, fontWeight: '500' }}>
              {shot
                ? 'We’ll match this against your Aadhaar photo. Nobody else sees it.'
                : 'A quick selfie proves the registered driver is the one driving. Good light, no sunglasses or mask.'}
            </Text>
          </Animated.View>
        </View>

        {err && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.md }}>
            <Ionicons name="alert-circle" size={18} color={c.danger} />
            <Text style={{ color: c.danger, flex: 1, fontWeight: '700' }}>{err}</Text>
          </View>
        )}

        {shot ? (
          <View style={{ gap: s.sm }}>
            <Button label="Submit check" icon="checkmark" variant="success" onPress={submit} loading={busy} />
            <Touch onPress={() => setShot(null)} style={{ paddingVertical: s.sm }}>
              <Text style={{ color: c.inkMuted, textAlign: 'center', fontWeight: '700' }}>Retake</Text>
            </Touch>
          </View>
        ) : (
          <Button label="Take selfie" icon="camera" onPress={take} loading={busy} />
        )}

        <Card style={{ padding: s.md }}>
          <View style={{ flexDirection: 'row', gap: s.sm }}>
            <Ionicons name="lock-closed-outline" size={15} color={c.inkFaint} />
            <Text style={{ color: c.inkFaint, fontSize: 12, flex: 1, lineHeight: 18 }}>
              Stored encrypted as verification evidence only, never shown to customers. Required under our safety policy.
            </Text>
          </View>
        </Card>
      </View>
    </View>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { c, r, s, shadow, type as t } from '@/lib/theme';
import { Button, Card, Header, IconChip } from '@/lib/components';

export default function Refer() {
  const [code, setCode] = useState('ACTING');

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    // Deterministic code from the user id — stable per driver.
    setCode('ACT' + sess.session.user.id.replace(/\D/g, '').slice(0, 5).padStart(5, '0'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const share = () => Share.share({ message: `Drive with Acting and earn on your own licence. Use my code ${code} when you sign up. https://acting.loankard.com` });

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Refer a driver" />
      <View style={{ padding: s.lg, gap: s.lg }}>
        <View style={[{ backgroundColor: c.surfaceAlt, borderRadius: r.xl, padding: s.xl, alignItems: 'center' }, shadow.hero]}>
          <IconChip icon="gift" tint={c.gold} />
          <Text style={{ color: c.ink, fontSize: 22, fontWeight: '800', marginTop: s.md, textAlign: 'center' }}>Invite operators you trust</Text>
          <Text style={{ color: 'rgba(255,255,255,0.72)', textAlign: 'center', marginTop: s.sm, lineHeight: 21 }}>
            When a driver you refer completes their first trip, you both earn a reward.
          </Text>
          <View style={{ marginTop: s.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.3)', borderRadius: r.md, paddingVertical: s.md, paddingHorizontal: s.xl }}>
            <Text style={{ color: c.gold, fontSize: 24, fontWeight: '800', letterSpacing: 3 }}>{code}</Text>
          </View>
        </View>

        <Button label="Share your code" icon="share-social" onPress={share} />

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Ionicons name="information-circle-outline" size={18} color={c.inkMuted} />
            <Text style={{ color: c.inkMuted, fontSize: 13, flex: 1 }}>Rewards are credited after your referral’s first completed trip. Full terms in Help.</Text>
          </View>
        </Card>
      </View>
    </View>
  );
}

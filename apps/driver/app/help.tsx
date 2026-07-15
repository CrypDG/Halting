import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { c, r, s, type as t } from '@/lib/theme';
import { Card, Header, MenuRow } from '@/lib/components';

const FAQ = [
  { q: 'How do I go online?', a: 'Open Home and tap “Go online”. You must be approved and have location permission on. Customers nearby can then send you trip requests.' },
  { q: 'When do I get paid?', a: 'In-app fares settle to your bank T+1, minus platform dues. Cash trips are collected directly and confirmed by the customer in the app.' },
  { q: 'What is the ₹500 setup fee?', a: 'A one-time fee due only after your first completed trip. Until it’s cleared you can’t go online for new trips. Pay it from the banner on Home.' },
  { q: 'Why can’t I see some vehicle types?', a: 'You only appear for vehicles your verified licence class allows. A car licence won’t show crane requests.' },
  { q: 'The customer didn’t pay cash — what now?', a: 'Mark “Cash collected” only after you receive it. If there’s a dispute, raise a ticket here and we’ll review the trip’s GPS log.' },
];

export default function Help() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Help & support" />
      <ScrollView contentContainerStyle={{ padding: s.lg, gap: s.lg }}>
        <View>
          <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Contact us</Text>
          <Card style={{ padding: 0 }}>
            <MenuRow icon="call-outline" tint={c.online} title="Call support" subtitle="7 AM – 11 PM, every day" onPress={() => Linking.openURL('tel:+914400000000')} />
            <MenuRow icon="mail-outline" tint={c.brand} title="Email us" subtitle="support@acting.dev" onPress={() => Linking.openURL('mailto:support@acting.dev')} />
            <MenuRow icon="chatbubbles-outline" tint={c.gold} title="Raise a trip ticket" subtitle="Report an issue with a trip" onPress={() => Linking.openURL('mailto:support@acting.dev?subject=Trip issue')} last />
          </Card>
        </View>

        <View>
          <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Frequently asked</Text>
          <Card style={{ padding: s.xs }}>
            {FAQ.map((f, i) => (
              <View key={i}>
                <Pressable onPress={() => setOpen(open === i ? null : i)} style={({ pressed }) => [{ padding: s.md }, pressed && { opacity: 0.6 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
                    <Text style={{ color: c.ink, fontWeight: '600', fontSize: 15, flex: 1 }}>{f.q}</Text>
                    <Ionicons name={open === i ? 'chevron-up' : 'chevron-down'} size={18} color={c.inkFaint} />
                  </View>
                  {open === i && <Text style={{ color: c.inkMuted, fontSize: 14, lineHeight: 21, marginTop: s.sm }}>{f.a}</Text>}
                </Pressable>
                {i < FAQ.length - 1 && <View style={{ height: 1, backgroundColor: c.border, marginHorizontal: s.md }} />}
              </View>
            ))}
          </Card>
        </View>
      </ScrollView>
    </View>
  );
}

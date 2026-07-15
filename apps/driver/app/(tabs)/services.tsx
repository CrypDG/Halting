import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { c, s, type as t } from '@/lib/theme';
import { Card, MenuRow, ScreenHeader } from '@/lib/components';

export default function Services() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={{ paddingTop: insets.top + s.md, padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Services" subtitle="Everything you need to keep driving" />

      <View>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Compliance</Text>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="document-text-outline" tint={c.brand} title="Documents" subtitle="Licence, police certificate, insurance" onPress={() => router.push('/documents')} last />
        </Card>
      </View>

      <View>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Earnings</Text>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="wallet-outline" tint={c.online} title="Payouts & bank" subtitle="Where your fares are settled" onPress={() => router.push('/payout')} />
          <MenuRow icon="bar-chart-outline" tint={c.gold} title="Earnings report" subtitle="Daily & weekly breakdown" onPress={() => router.push('/activity')} last />
        </Card>
      </View>

      <View>
        <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>More</Text>
        <Card style={{ padding: 0 }}>
          <MenuRow icon="gift-outline" tint={c.brand} title="Refer a driver" subtitle="Invite operators, earn rewards" onPress={() => router.push('/refer')} />
          <MenuRow icon="shield-outline" tint={c.danger} title="Safety toolkit" subtitle="SOS & emergency contacts" onPress={() => router.push('/safety')} />
          <MenuRow icon="help-buoy-outline" tint={c.steel} title="Help & support" subtitle="FAQs and contact" onPress={() => router.push('/help')} last />
        </Card>
      </View>
    </ScrollView>
  );
}

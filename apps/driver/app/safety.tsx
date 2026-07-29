import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { c, r, s, shadow, type as t } from '@/lib/theme';
import { Card, FormField, Header, IconChip } from '@/lib/components';

const KEY = { name: 'acting.emg.name', phone: 'acting.emg.phone' };

export default function Safety() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setName((await AsyncStorage.getItem(KEY.name)) ?? '');
    setPhone((await AsyncStorage.getItem(KEY.phone)) ?? '');
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveContact() {
    await AsyncStorage.multiSet([[KEY.name, name.trim()], [KEY.phone, phone.trim()]]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function sos() {
    let loc = '';
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        loc = `https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`;
      }
    } catch { /* ignore */ }
    Alert.alert('Emergency', 'Call police (112) now?' + (loc ? '\n\nYour location is ready to share with your contact.' : ''), [
      { text: 'Cancel', style: 'cancel' },
      ...(phone ? [{ text: 'Alert my contact', onPress: () => Linking.openURL(`sms:${phone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent('I need help. My location: ' + loc)}`) }] : []),
      { text: 'Call 112', style: 'destructive', onPress: () => Linking.openURL('tel:112') },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Safety toolkit" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: s.lg, gap: s.lg }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={sos} style={({ pressed }) => [{ backgroundColor: c.danger, borderRadius: r.xl, padding: s.xl, alignItems: 'center' }, shadow.hero, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="warning" size={30} color="#FFFFFF" />
            </View>
            <Text style={{ color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: s.md }}>SOS Emergency</Text>
            <Text style={{ color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginTop: 4 }}>Call 112 and alert your contact with your live location</Text>
          </Pressable>

          <View>
            <Text style={[t.label, { color: c.inkMuted, marginBottom: s.sm, paddingHorizontal: s.xs }]}>Emergency contact</Text>
            <Card style={{ gap: s.md }}>
              <FormField label="Name" placeholder="e.g. Family member" value={name} onChangeText={setName} />
              <FormField label="Phone" placeholder="+91 number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
              <Pressable onPress={saveContact} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s.sm, paddingVertical: s.sm }, pressed && { opacity: 0.6 }]}>
                <Ionicons name={saved ? 'checkmark-circle' : 'save-outline'} size={18} color={saved ? c.online : c.brand} />
                <Text style={{ color: saved ? c.online : c.brand, fontWeight: '700' }}>{saved ? 'Saved' : 'Save contact'}</Text>
              </Pressable>
            </Card>
          </View>

          <Card>
            <View style={{ flexDirection: 'row', gap: s.md }}>
              <IconChip icon="shield-checkmark" tint={c.verified} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.ink, fontWeight: '700' }}>Every trip is logged</Text>
                <Text style={{ color: c.inkMuted, fontSize: 13, marginTop: 2, lineHeight: 19 }}>The customer confirms your photo, a start OTP proves you reached the vehicle, and the full route is recorded.</Text>
              </View>
            </View>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

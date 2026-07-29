import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { pickAndUploadAvatar } from '@/lib/photo';
import { c, s } from '@/lib/theme';
import { Avatar, Button, FormField, Header } from '@/lib/components';

export default function ProfileEdit() {
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    setUid(sess.session.user.id);
    const { data } = await supabase.from('profiles').select('full_name, phone, photo_url').eq('id', sess.session.user.id).maybeSingle();
    setName(data?.full_name ?? '');
    setPhone(data?.phone ?? '');
    setPhoto(data?.photo_url ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function changePhoto() {
    if (!uid) return;
    setUploading(true); setErr(null);
    try { const url = await pickAndUploadAvatar(uid); if (url) setPhoto(url); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!uid) return;
    setBusy(true); setErr(null);
    try {
      const { error } = await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() }).eq('id', uid);
      if (error) throw error;
      Alert.alert('Saved', 'Your profile has been updated.', [{ text: 'OK', onPress: () => router.back() }]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Save failed'); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Edit profile" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: s.lg, gap: s.lg }} keyboardShouldPersistTaps="handled">
          <View style={{ alignItems: 'center', gap: s.md }}>
            <Pressable onPress={changePhoto} disabled={uploading}>
              <Avatar name={name || 'Driver'} uri={photo} size={96} />
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 34, height: 34, borderRadius: 17, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.bg }}>
                <Ionicons name={uploading ? 'hourglass' : 'camera'} size={16} color={c.onInk} />
              </View>
            </Pressable>
            <Text style={{ color: c.inkMuted, fontSize: 13 }}>{uploading ? 'Uploading…' : 'Tap to change photo'}</Text>
          </View>

          <FormField label="Full name" placeholder="Your name" value={name} onChangeText={setName} />
          <FormField label="Phone" placeholder="+91 number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />

          {err && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: 12, padding: s.md }}>
              <Ionicons name="alert-circle" size={18} color={c.danger} />
              <Text style={{ color: c.danger, flex: 1, fontWeight: '600' }}>{err}</Text>
            </View>
          )}

          <Button label="Save changes" icon="checkmark" onPress={save} loading={busy} disabled={!name.trim()} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

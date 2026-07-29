import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { effectiveStatus, pickDocumentImage, saveDocument, signedDocUrl, type DocType, type UserDoc } from '@/lib/documents';
import { c, r, s, type as t } from '@/lib/theme';
import { Badge, Button, Card, FormField, Header, IconChip, Touch } from '@/lib/components';

export default function DocumentUpload() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const [uid, setUid] = useState<string | null>(null);
  const [docType, setDocType] = useState<DocType | null>(null);
  const [existing, setExisting] = useState<UserDoc | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [image, setImage] = useState<{ base64: string; ext: string } | null>(null);
  const [number, setNumber] = useState('');
  const [provider, setProvider] = useState('');
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: sess } = await supabase.auth.getSession();
    if (!sess.session) return router.replace('/login');
    const id = sess.session.user.id;
    setUid(id);
    const [{ data: ty }, { data: ud }] = await Promise.all([
      supabase.from('document_types').select('*').eq('slug', type).maybeSingle(),
      supabase.from('user_documents').select('*').eq('owner_id', id).eq('doc_type', type).maybeSingle(),
    ]);
    setDocType(ty as DocType);
    if (ud) {
      const d = ud as UserDoc;
      setExisting(d);
      setNumber(d.doc_number ?? '');
      setProvider(d.provider ?? '');
      setExpiry(d.expires_on ?? '');
      setPreview(await signedDocUrl(d.file_path));
    }
  }, [type]);
  useEffect(() => { load(); }, [load]);

  async function pick(fromCamera: boolean) {
    setErr(null);
    try {
      const img = await pickDocumentImage(fromCamera);
      if (!img) return;
      setImage(img);
      setPreview(`data:image/${img.ext === 'png' ? 'png' : 'jpeg'};base64,${img.base64}`);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not open picker'); }
  }

  const validExpiry = !expiry || /^\d{4}-\d{2}-\d{2}$/.test(expiry);

  async function submit() {
    if (!uid || !docType) return;
    if (!image && !existing) { setErr('Add a photo of the document first'); return; }
    if (docType.needs_expiry && !expiry) { setErr('Enter the expiry date'); return; }
    if (!validExpiry) { setErr('Expiry must look like 2027-03-31'); return; }
    setBusy(true); setErr(null);
    try {
      if (image) {
        await saveDocument({ uid, docType: docType.slug, image, docNumber: number, provider, expiresOn: expiry || null });
      } else {
        const { error } = await supabase.from('user_documents')
          .update({ doc_number: number.trim() || null, provider: provider.trim() || null, expires_on: expiry || null })
          .eq('owner_id', uid).eq('doc_type', docType.slug);
        if (error) throw error;
      }
      Alert.alert('Submitted', 'Your document is now in review. We usually check within a day.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) { setErr(e instanceof Error ? e.message : 'Upload failed'); }
    finally { setBusy(false); }
  }

  if (!docType) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Header title="Document" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: c.inkMuted }}>Loading…</Text></View>
      </View>
    );
  }

  const st = existing ? effectiveStatus(existing) : null;
  const locked = st === 'verified';

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title={docType.name} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: s.lg, gap: s.lg, paddingBottom: s.xxxl }} keyboardShouldPersistTaps="handled">
          {st && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
              <Badge
                label={st === 'verified' ? 'Verified' : st === 'pending' ? 'In review' : st === 'expired' ? 'Expired' : 'Rejected'}
                tone={st === 'verified' ? 'online' : st === 'pending' ? 'warn' : 'danger'}
                icon={st === 'verified' ? 'checkmark-circle' : undefined}
              />
              {st === 'rejected' && existing?.rejection_reason ? (
                <Text style={{ color: c.danger, flex: 1, fontSize: 13, fontWeight: '600' }}>{existing.rejection_reason}</Text>
              ) : null}
            </View>
          )}

          {docType.hint ? (
            <View style={{ flexDirection: 'row', gap: s.md }}>
              <IconChip icon="information-circle-outline" tint={c.brand} />
              <Text style={{ color: c.inkMuted, flex: 1, lineHeight: 20, fontWeight: '500' }}>{docType.hint}</Text>
            </View>
          ) : null}

          {/* photo */}
          <Card>
            {preview ? (
              <Animated.View entering={FadeIn}>
                <Image source={{ uri: preview }} style={{ width: '100%', height: 200, borderRadius: r.md, backgroundColor: c.surfaceAlt }} resizeMode="cover" />
              </Animated.View>
            ) : (
              <View style={{ height: 200, borderRadius: r.md, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: s.sm, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' }}>
                <Ionicons name="document-attach-outline" size={30} color={c.inkFaint} />
                <Text style={{ color: c.inkFaint, fontWeight: '600' }}>No photo yet</Text>
              </View>
            )}
            {!locked && (
              <View style={{ flexDirection: 'row', gap: s.md, marginTop: s.md }}>
                <Touch onPress={() => pick(true)} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: r.md, paddingVertical: s.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
                  <Ionicons name="camera" size={18} color={c.ink} />
                  <Text style={{ color: c.ink, fontWeight: '700' }}>Camera</Text>
                </Touch>
                <Touch onPress={() => pick(false)} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: r.md, paddingVertical: s.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
                  <Ionicons name="images" size={18} color={c.ink} />
                  <Text style={{ color: c.ink, fontWeight: '700' }}>Gallery</Text>
                </Touch>
              </View>
            )}
          </Card>

          {!locked && (
            <View style={{ gap: s.md }}>
              <FormField label="Policy / document number" placeholder="Optional" value={number} onChangeText={setNumber} autoCapitalize="characters" />
              <FormField label="Issuer / insurer" placeholder="Optional" value={provider} onChangeText={setProvider} />
              {docType.needs_expiry && (
                <FormField label="Expires on" placeholder="YYYY-MM-DD" value={expiry} onChangeText={setExpiry} hint="We'll remind you before it lapses." keyboardType="numbers-and-punctuation" />
              )}
            </View>
          )}

          {err && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.md }}>
              <Ionicons name="alert-circle" size={18} color={c.danger} />
              <Text style={{ color: c.danger, flex: 1, fontWeight: '700' }}>{err}</Text>
            </View>
          )}

          {locked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, justifyContent: 'center' }}>
              <Ionicons name="lock-closed" size={16} color={c.inkFaint} />
              <Text style={{ color: c.inkFaint, fontWeight: '600' }}>Verified documents can't be edited. Contact support to replace.</Text>
            </View>
          ) : (
            <Button label={existing ? 'Resubmit for review' : 'Submit for review'} icon="cloud-upload" onPress={submit} loading={busy} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

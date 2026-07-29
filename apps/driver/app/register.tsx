import { useEffect, useMemo, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  mockKycProvider, mockLicenseVerifier, mockPaymentGateway, permittedCategories,
  VEHICLE_CATEGORIES, type LicenseClass, type VehicleCategorySlug,
} from '@acting/shared';
import { supabase } from '@/lib/supabase';
import { pickDocumentImage } from '@/lib/documents';
import { pickAndUploadAvatar } from '@/lib/photo';
import { c, r, s, type as t } from '@/lib/theme';
import { Avatar, Badge, Button, Card, FormField, Header, IconChip, Touch } from '@/lib/components';

type CategoryDraft = { perKm: string; perDay: string; overtime: string };

const CAT_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  car: 'car', tractor: 'tractor', truck: 'truck', bus: 'bus',
  school_bus: 'bus-school', crane: 'crane', earth_mover: 'excavator',
};

const STEPS = ['Profile', 'Identity', 'Licence', 'Vehicles', 'Police', 'Payout', 'Review'] as const;

/**
 * Driver onboarding after mobile-OTP sign-in (PRD §3.2). Verification
 * providers are mocks — each step auto-approves with fabricated data until
 * the real KYC/Sarathi/PSP integrations replace them.
 */
export default function Register() {
  const [step, setStep] = useState(0);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // collected along the way
  const [name, setName] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState<string | null>(null);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [dob, setDob] = useState('1990-01-01');
  const [classes, setClasses] = useState<LicenseClass[]>([]);
  const [selected, setSelected] = useState<Partial<Record<VehicleCategorySlug, CategoryDraft>>>({});
  const [experience, setExperience] = useState('5');
  const [certPreview, setCertPreview] = useState<string | null>(null);
  const [certUploaded, setCertUploaded] = useState(false);
  const [upi, setUpi] = useState('');
  const [payoutOk, setPayoutOk] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return router.replace('/login');
      setUid(data.session.user.id);
      const { data: p } = await supabase.from('profiles').select('full_name, phone, photo_url, masked_aadhaar').eq('id', data.session.user.id).maybeSingle();
      if (p) {
        setName(p.full_name ?? '');
        setPhone(p.phone ?? '');
        setPhoto(p.photo_url ?? null);
        setMasked(p.masked_aadhaar ?? null);
      }
    });
  }, []);

  const allowed = useMemo(() => permittedCategories(classes), [classes]);

  async function run(fn: () => Promise<void>, advance = true) {
    setBusy(true); setError(null);
    try { await fn(); if (advance) setStep((v) => v + 1); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong'); }
    finally { setBusy(false); }
  }

  const body = (() => {
    switch (step) {
      case 0: return ( // ── Profile ────────────────────────────────────────
        <View style={{ gap: s.lg }}>
          <View style={{ alignItems: 'center', gap: s.sm }}>
            <Pressable onPress={() => run(async () => { if (uid) { const u = await pickAndUploadAvatar(uid); if (u) setPhoto(u); } }, false)}>
              <Avatar name={name || 'D'} uri={photo} size={92} />
              <View style={{ position: 'absolute', right: -2, bottom: -2, width: 32, height: 32, borderRadius: 16, backgroundColor: c.brand, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: c.bg }}>
                <Ionicons name="camera" size={15} color={c.onInk} />
              </View>
            </Pressable>
            <Text style={{ color: c.inkFaint, fontSize: 12 }}>Photo optional — a live selfie is taken at approval</Text>
          </View>
          <FormField label="Full name" placeholder="As on your licence" value={name} onChangeText={setName} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
            <Ionicons name="call" size={15} color={c.verified} />
            <Text style={{ color: c.inkMuted, fontWeight: '600' }}>{phone || 'Phone'} · verified by OTP</Text>
          </View>
          <Button label="Continue" icon="arrow-forward" disabled={!name.trim()} loading={busy}
            onPress={() => run(async () => {
              const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', uid!);
              if (error) throw error;
            })} />
        </View>
      );
      case 1: return ( // ── Aadhaar ────────────────────────────────────────
        <View style={{ gap: s.lg }}>
          <View style={{ flexDirection: 'row', gap: s.md }}>
            <IconChip icon="finger-print" tint={c.verified} />
            <Text style={{ color: c.inkMuted, flex: 1, lineHeight: 21, fontWeight: '500' }}>
              DigiLocker / OKYC via a licensed provider, with a selfie face-match. Only your masked Aadhaar number is stored — never the full number.
            </Text>
          </View>
          {masked && <Badge label={`Verified · ${masked}`} tone="online" icon="checkmark-circle" />}
          <Button
            label={masked ? 'Continue' : 'Verify Aadhaar (mock)'}
            icon={masked ? 'arrow-forward' : 'finger-print'}
            loading={busy}
            onPress={() => masked ? setStep(step + 1) : run(async () => {
              const kyc = await mockKycProvider.verifyAadhaar({ phone });
              const ok = await mockKycProvider.faceMatch({ selfieBase64: 'mock', verificationToken: kyc.verificationToken });
              if (!kyc.verified || !ok) throw new Error('KYC failed — try again');
              const { error } = await supabase.from('profiles').update({
                masked_aadhaar: kyc.maskedAadhaar, kyc_name: kyc.name, kyc_dob: kyc.dob,
                kyc_token: kyc.verificationToken, kyc_verified_at: new Date().toISOString(),
              }).eq('id', uid!);
              if (error) throw error;
              setMasked(kyc.maskedAadhaar);
            })}
          />
        </View>
      );
      case 2: return ( // ── Licence ────────────────────────────────────────
        <View style={{ gap: s.md }}>
          <Text style={{ color: c.inkMuted, lineHeight: 20, fontWeight: '500' }}>
            Checked against Sarathi/Parivahan — your licence classes decide which vehicles you can drive. (Mock tip: start the number with HMV, HPMV or CEV for heavy classes.)
          </Text>
          <FormField label="Licence number" placeholder="TN01 2020 0001234" autoCapitalize="characters" value={licenseNumber} onChangeText={setLicenseNumber} />
          <FormField label="Date of birth" placeholder="YYYY-MM-DD" value={dob} onChangeText={setDob} />
          {classes.length > 0 && <Badge label={`Classes: ${classes.join(', ')}`} tone="online" icon="checkmark-circle" />}
          <Button
            label={classes.length ? 'Continue' : 'Verify licence (mock Sarathi)'}
            icon={classes.length ? 'arrow-forward' : 'card'}
            disabled={!licenseNumber.trim()}
            loading={busy}
            onPress={() => classes.length ? setStep(step + 1) : run(async () => {
              const res = await mockLicenseVerifier.verify({ licenseNumber: licenseNumber.trim(), dob });
              if (!res.valid) throw new Error('Licence could not be verified');
              const { error } = await supabase.from('driver_profiles').update({
                license_number: licenseNumber.trim(), license_classes: res.classes,
                license_expiry: res.expiryDate, license_verified_at: new Date().toISOString(),
              }).eq('driver_id', uid!);
              if (error) throw error;
              setClasses(res.classes);
            }, false)}
          />
        </View>
      );
      case 3: return ( // ── Vehicles & pricing ─────────────────────────────
        <View style={{ gap: s.md }}>
          <Text style={{ color: c.inkMuted, fontWeight: '500' }}>
            Your licence permits: <Text style={{ color: c.ink, fontWeight: '700' }}>{allowed.join(', ') || 'none'}</Text>. Pick what you'll drive and set your own rates.
          </Text>
          {VEHICLE_CATEGORIES.filter((v) => allowed.includes(v.slug)).map((v) => {
            const active = selected[v.slug];
            return (
              <Card key={v.slug} style={{ padding: s.md, borderColor: active ? c.brand : c.border }}>
                <Touch scaleTo={0.99} onPress={() => setSelected((prev) => {
                  const next = { ...prev };
                  if (next[v.slug]) delete next[v.slug];
                  else next[v.slug] = { perKm: '', perDay: '', overtime: '' };
                  return next;
                })}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.md }}>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: active ? c.brandSoft : c.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name={CAT_ICONS[v.slug] ?? 'steering'} size={22} color={active ? c.brand : c.inkMuted} />
                    </View>
                    <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15, flex: 1 }}>{v.name}</Text>
                    <Ionicons name={active ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={active ? c.brand : c.inkFaint} />
                  </View>
                </Touch>
                {active && (
                  <View style={{ flexDirection: 'row', gap: s.sm, marginTop: s.md }}>
                    {(['perKm', 'perDay', 'overtime'] as const).map((f) => (
                      <TextInput key={f} placeholder={f === 'perKm' ? '₹/km' : f === 'perDay' ? '₹/day' : '₹/hr OT'} placeholderTextColor={c.inkFaint} keyboardType="numeric"
                        value={active[f]} onChangeText={(val) => setSelected((prev) => ({ ...prev, [v.slug]: { ...prev[v.slug]!, [f]: val } }))}
                        style={{ flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: r.sm, paddingHorizontal: s.sm, paddingVertical: 10, color: c.ink, fontWeight: '700', backgroundColor: c.surfaceAlt, textAlign: 'center' }} />
                    ))}
                  </View>
                )}
              </Card>
            );
          })}
          <FormField label="Years of experience" keyboardType="numeric" value={experience} onChangeText={setExperience} />
          <Button label="Save & continue" icon="arrow-forward" loading={busy}
            disabled={Object.keys(selected).length === 0}
            onPress={() => run(async () => {
              const rows = Object.entries(selected).map(([slug, d]) => ({
                driver_id: uid!, category_slug: slug,
                price_per_km: d!.perKm ? Number(d!.perKm) : null,
                price_per_day: d!.perDay ? Number(d!.perDay) : null,
                overtime_per_hour: d!.overtime ? Number(d!.overtime) : null,
              }));
              for (const row of rows) {
                if (row.price_per_km == null && row.price_per_day == null) throw new Error(`Set at least one rate for ${row.category_slug}`);
              }
              const { error } = await supabase.from('driver_categories').upsert(rows);
              if (error) throw error;
              const { error: e2 } = await supabase.from('driver_profiles').update({ experience_years: Number(experience) || 0 }).eq('driver_id', uid!);
              if (e2) throw e2;
            })} />
        </View>
      );
      case 4: return ( // ── Police certificate (real upload) ───────────────
        <View style={{ gap: s.lg }}>
          <Text style={{ color: c.inkMuted, lineHeight: 20, fontWeight: '500' }}>
            Upload your Police Verification Certificate (issued within the last 12 months). Our team reviews it before you can go online.
          </Text>
          {certPreview ? (
            <Image source={{ uri: certPreview }} style={{ width: '100%', height: 190, borderRadius: r.md, backgroundColor: c.surfaceAlt }} resizeMode="cover" />
          ) : (
            <View style={{ height: 190, borderRadius: r.md, backgroundColor: c.surfaceAlt, alignItems: 'center', justifyContent: 'center', gap: s.sm, borderWidth: 1, borderColor: c.border, borderStyle: 'dashed' }}>
              <Ionicons name="shield-outline" size={30} color={c.inkFaint} />
              <Text style={{ color: c.inkFaint, fontWeight: '600' }}>No certificate yet</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', gap: s.md }}>
            {([['camera', true], ['images', false]] as const).map(([icon, cam]) => (
              <Touch key={icon} onPress={() => run(async () => {
                const img = await pickDocumentImage(cam);
                if (!img) return;
                const bytes = Uint8Array.from(atob(img.base64), (ch) => ch.charCodeAt(0));
                const path = `${uid}/police_cert.${img.ext}`;
                const { error } = await supabase.storage.from('documents').upload(path, bytes, { contentType: `image/${img.ext === 'png' ? 'png' : 'jpeg'}`, upsert: true });
                if (error) throw error;
                const expiry = new Date(); expiry.setMonth(expiry.getMonth() + 12);
                const { error: e2 } = await supabase.from('driver_profiles').update({ police_cert_path: path, police_cert_expiry: expiry.toISOString().slice(0, 10) }).eq('driver_id', uid!);
                if (e2) throw e2;
                setCertPreview(`data:image/${img.ext === 'png' ? 'png' : 'jpeg'};base64,${img.base64}`);
                setCertUploaded(true);
              }, false)} style={{ flex: 1, backgroundColor: c.surfaceAlt, borderRadius: r.md, paddingVertical: s.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
                <Ionicons name={icon} size={18} color={c.ink} />
                <Text style={{ color: c.ink, fontWeight: '700' }}>{cam ? 'Camera' : 'Gallery'}</Text>
              </Touch>
            ))}
          </View>
          <Button label="Continue" icon="arrow-forward" disabled={!certUploaded} loading={busy} onPress={() => setStep(step + 1)} />
        </View>
      );
      case 5: return ( // ── Payout ─────────────────────────────────────────
        <View style={{ gap: s.md }}>
          <Text style={{ color: c.inkMuted, lineHeight: 20, fontWeight: '500' }}>
            Where your fares are settled, T+1. Verified with a ₹1 penny-drop (mocked for now).
          </Text>
          <FormField label="UPI ID or account number" placeholder="yourname@upi" autoCapitalize="none" value={upi} onChangeText={setUpi} />
          {payoutOk && <Badge label="Payout verified" tone="online" icon="checkmark-circle" />}
          <Button
            label={payoutOk ? 'Continue' : 'Verify payout (mock)'}
            icon={payoutOk ? 'arrow-forward' : 'wallet'}
            disabled={!upi.trim()}
            loading={busy}
            onPress={() => payoutOk ? setStep(step + 1) : run(async () => {
              const ok = await mockPaymentGateway.verifyPayout({ upiOrAccount: upi.trim() });
              if (!ok) throw new Error('Could not verify this account');
              const { error } = await supabase.from('driver_profiles').update({
                upi_or_account: upi.trim(), payout_verified_at: new Date().toISOString(),
                selfie_path: `${uid}/selfie.jpg`, // live selfie capture arrives with real KYC
              }).eq('driver_id', uid!);
              if (error) throw error;
              setPayoutOk(true);
            }, false)}
          />
        </View>
      );
      default: return ( // ── Review & submit ────────────────────────────────
        <View style={{ gap: s.lg }}>
          <View style={{ gap: s.sm }}>
            {[
              ['person', name],
              ['finger-print', masked ?? '—'],
              ['card', `${licenseNumber} · ${classes.join(', ')}`],
              ['car-sport', Object.keys(selected).join(', ')],
              ['shield-checkmark', certUploaded ? 'Police certificate uploaded' : '—'],
              ['wallet', upi],
            ].map(([icon, val]) => (
              <View key={icon as string} style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm }}>
                <Ionicons name={`${icon}-outline` as any} size={16} color={c.verified} />
                <Text style={{ color: c.ink, fontWeight: '600', flex: 1 }} numberOfLines={1}>{val as string}</Text>
              </View>
            ))}
          </View>
          <Text style={{ color: c.inkMuted, lineHeight: 20, fontWeight: '500' }}>
            Submit and our team will review your documents — usually within a day. You'll be able to go online the moment you're approved.
          </Text>
          <Button label="Submit for review" icon="paper-plane" variant="success" loading={busy}
            onPress={() => run(async () => {
              const { error } = await supabase.from('driver_profiles').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('driver_id', uid!);
              if (error) throw error;
              router.replace('/pending');
            }, false)} />
        </View>
      );
    }
  })();

  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Header title="Become an Acting driver" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: s.lg, paddingBottom: s.xxxl, gap: s.lg }} keyboardShouldPersistTaps="handled">
          {/* progress */}
          <Animated.View entering={FadeInDown} style={{ gap: s.sm }}>
            <View style={{ flexDirection: 'row', gap: 5 }}>
              {STEPS.map((_, i) => (
                <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= step ? c.brand : c.surfaceHi }} />
              ))}
            </View>
            <Text style={[t.label, { color: c.inkFaint }]}>
              Step {Math.min(step + 1, STEPS.length)} of {STEPS.length} · {STEPS[Math.min(step, STEPS.length - 1)]}
            </Text>
          </Animated.View>

          {error && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: s.sm, backgroundColor: c.dangerSoft, borderRadius: r.md, padding: s.md }}>
              <Ionicons name="alert-circle" size={18} color={c.danger} />
              <Text style={{ color: c.danger, flex: 1, fontWeight: '700' }}>{error}</Text>
            </View>
          )}

          <Animated.View key={step} entering={FadeInUp.springify().damping(20)}>
            {body}
          </Animated.View>

          {step > 0 && (
            <Touch onPress={() => { setStep((v) => v - 1); setError(null); }} style={{ alignSelf: 'center', paddingVertical: s.sm }} hitSlop={8}>
              <Text style={{ color: c.inkFaint, fontWeight: '700' }}>← Back</Text>
            </Touch>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

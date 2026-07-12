import { useEffect, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import {
  mockKycProvider,
  mockLicenseVerifier,
  mockPaymentGateway,
  permittedCategories,
  VEHICLE_CATEGORIES,
  type LicenseClass,
  type VehicleCategorySlug,
} from '@halting/shared';
import { supabase } from '@/lib/supabase';
import { colors, ui } from '@/lib/ui';

type CategoryDraft = { perKm: string; perDay: string; overtime: string };

/**
 * Driver registration wizard (PRD §3.2). Verification providers are mocks —
 * every step auto-approves with fabricated data in this build.
 */
export default function Register() {
  const [step, setStep] = useState(0);
  const [uid, setUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // step data
  const [phone, setPhone] = useState('');
  const [kycDone, setKycDone] = useState(false);
  const [licenseNumber, setLicenseNumber] = useState('');
  const [dob, setDob] = useState('1990-01-01');
  const [classes, setClasses] = useState<LicenseClass[]>([]);
  const [selected, setSelected] = useState<Partial<Record<VehicleCategorySlug, CategoryDraft>>>({});
  const [policeAck, setPoliceAck] = useState(false);
  const [upi, setUpi] = useState('');
  const [experience, setExperience] = useState('5');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login');
      else setUid(data.session.user.id);
    });
  }, []);

  const allowed = permittedCategories(classes);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setStep((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(false);
    }
  }

  const steps: Array<{ title: string; body: React.ReactNode }> = [
    {
      title: '1 · Phone',
      body: (
        <>
          <Text style={ui.muted}>Your contact number (OTP verification is mocked in this build).</Text>
          <TextInput style={[ui.input, { marginTop: 12 }]} placeholder="+91 phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          <TouchableOpacity
            style={ui.btn}
            disabled={busy || phone.length < 10}
            onPress={() => run(async () => {
              const { error } = await supabase.from('profiles').update({ phone }).eq('id', uid!);
              if (error) throw error;
            })}
          >
            <Text style={ui.btnText}>Verify phone</Text>
          </TouchableOpacity>
        </>
      ),
    },
    {
      title: '2 · Aadhaar eKYC',
      body: (
        <>
          <Text style={ui.muted}>
            DigiLocker / OKYC flow via a licensed provider. Only the masked number is stored — never the raw Aadhaar.
          </Text>
          <TouchableOpacity
            style={[ui.btn, { marginTop: 16 }]}
            disabled={busy}
            onPress={() => run(async () => {
              const kyc = await mockKycProvider.verifyAadhaar({ phone });
              const ok = await mockKycProvider.faceMatch({ selfieBase64: 'mock', verificationToken: kyc.verificationToken });
              if (!kyc.verified || !ok) throw new Error('KYC failed');
              const { error } = await supabase.from('profiles').update({
                masked_aadhaar: kyc.maskedAadhaar,
                kyc_name: kyc.name,
                kyc_dob: kyc.dob,
                kyc_token: kyc.verificationToken,
                kyc_verified_at: new Date().toISOString(),
              }).eq('id', uid!);
              if (error) throw error;
              setKycDone(true);
            })}
          >
            <Text style={ui.btnText}>Run Aadhaar eKYC (mock)</Text>
          </TouchableOpacity>
        </>
      ),
    },
    {
      title: '3 · Driving license',
      body: (
        <>
          <Text style={ui.muted}>
            Verified against Sarathi/Parivahan. Tip (mock): prefix HMV / HPMV / CEV to get heavy-vehicle classes.
          </Text>
          <TextInput style={[ui.input, { marginTop: 12 }]} placeholder="License number" autoCapitalize="characters" value={licenseNumber} onChangeText={setLicenseNumber} />
          <TextInput style={ui.input} placeholder="Date of birth (YYYY-MM-DD)" value={dob} onChangeText={setDob} />
          <TouchableOpacity
            style={ui.btn}
            disabled={busy || !licenseNumber}
            onPress={() => run(async () => {
              const res = await mockLicenseVerifier.verify({ licenseNumber, dob });
              if (!res.valid) throw new Error('License not valid');
              const { error } = await supabase.from('driver_profiles').update({
                license_number: licenseNumber,
                license_classes: res.classes,
                license_expiry: res.expiryDate,
                license_verified_at: new Date().toISOString(),
              }).eq('driver_id', uid!);
              if (error) throw error;
              setClasses(res.classes);
            })}
          >
            <Text style={ui.btnText}>Verify license (mock Sarathi)</Text>
          </TouchableOpacity>
        </>
      ),
    },
    {
      title: '4 · Categories & pricing',
      body: (
        <>
          <Text style={ui.muted}>
            Your license ({classes.join(', ')}) permits: {allowed.join(', ') || 'none'}. Set your own rates per category.
          </Text>
          {VEHICLE_CATEGORIES.filter((c) => allowed.includes(c.slug)).map((c) => {
            const active = selected[c.slug];
            return (
              <View key={c.slug} style={{ marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() =>
                    setSelected((s) => {
                      const next = { ...s };
                      if (next[c.slug]) delete next[c.slug];
                      else next[c.slug] = { perKm: '', perDay: '', overtime: '' };
                      return next;
                    })
                  }
                >
                  <Text style={{ fontWeight: '600', color: active ? colors.green : colors.text }}>
                    {active ? '☑' : '☐'} {c.name}
                  </Text>
                </TouchableOpacity>
                {active && (
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TextInput style={[ui.input, { flex: 1 }]} placeholder="₹/km" keyboardType="numeric" value={active.perKm} onChangeText={(v) => setSelected((s) => ({ ...s, [c.slug]: { ...s[c.slug]!, perKm: v } }))} />
                    <TextInput style={[ui.input, { flex: 1 }]} placeholder="₹/day" keyboardType="numeric" value={active.perDay} onChangeText={(v) => setSelected((s) => ({ ...s, [c.slug]: { ...s[c.slug]!, perDay: v } }))} />
                    <TextInput style={[ui.input, { flex: 1 }]} placeholder="₹/hr OT" keyboardType="numeric" value={active.overtime} onChangeText={(v) => setSelected((s) => ({ ...s, [c.slug]: { ...s[c.slug]!, overtime: v } }))} />
                  </View>
                )}
              </View>
            );
          })}
          <TextInput style={[ui.input, { marginTop: 12 }]} placeholder="Years of experience" keyboardType="numeric" value={experience} onChangeText={setExperience} />
          <TouchableOpacity
            style={ui.btn}
            disabled={busy || Object.keys(selected).length === 0}
            onPress={() => run(async () => {
              const rows = Object.entries(selected).map(([slug, d]) => ({
                driver_id: uid!,
                category_slug: slug,
                price_per_km: d!.perKm ? Number(d!.perKm) : null,
                price_per_day: d!.perDay ? Number(d!.perDay) : null,
                overtime_per_hour: d!.overtime ? Number(d!.overtime) : null,
              }));
              for (const r of rows) {
                if (r.price_per_km == null && r.price_per_day == null) {
                  throw new Error(`Set at least one rate for ${r.category_slug}`);
                }
              }
              const { error } = await supabase.from('driver_categories').upsert(rows);
              if (error) throw error;
              const { error: e2 } = await supabase.from('driver_profiles')
                .update({ experience_years: Number(experience) || 0 }).eq('driver_id', uid!);
              if (e2) throw e2;
            })}
          >
            <Text style={ui.btnText}>Save categories</Text>
          </TouchableOpacity>
        </>
      ),
    },
    {
      title: '5 · Police verification',
      body: (
        <>
          <Text style={ui.muted}>
            Upload your Police Verification Certificate (issued within 12 months). An admin reviews it manually before
            you can go online. (File upload is stubbed in this build — a placeholder document is attached.)
          </Text>
          <TouchableOpacity
            style={[ui.btn, { marginTop: 16 }]}
            disabled={busy}
            onPress={() => run(async () => {
              const { error } = await supabase.from('driver_profiles').update({
                police_cert_path: `${uid}/police-cert.jpg`,
                police_cert_expiry: new Date(Date.now() + 300 * 24 * 3600 * 1000).toISOString().slice(0, 10),
              }).eq('driver_id', uid!);
              if (error) throw error;
              setPoliceAck(true);
            })}
          >
            <Text style={ui.btnText}>Attach certificate (stub)</Text>
          </TouchableOpacity>
        </>
      ),
    },
    {
      title: '6 · Payout details',
      body: (
        <>
          <Text style={ui.muted}>UPI ID or bank account for settlements. Verified by penny drop (mocked).</Text>
          <TextInput style={[ui.input, { marginTop: 12 }]} placeholder="yourname@upi" autoCapitalize="none" value={upi} onChangeText={setUpi} />
          <TouchableOpacity
            style={ui.btn}
            disabled={busy || !upi}
            onPress={() => run(async () => {
              const ok = await mockPaymentGateway.verifyPayout({ upiOrAccount: upi });
              if (!ok) throw new Error('Payout verification failed');
              const { error } = await supabase.from('driver_profiles').update({
                upi_or_account: upi,
                payout_verified_at: new Date().toISOString(),
                selfie_path: `${uid}/selfie.jpg`, // live selfie capture stubbed
              }).eq('driver_id', uid!);
              if (error) throw error;
            })}
          >
            <Text style={ui.btnText}>Verify payout (mock)</Text>
          </TouchableOpacity>
        </>
      ),
    },
    {
      title: '7 · Submit for review',
      body: (
        <>
          <Text style={ui.muted}>
            Everything is in. Submit your profile — Halting operations will review your documents and approve you.
          </Text>
          <TouchableOpacity
            style={[ui.btn, ui.btnGreen, { marginTop: 16 }]}
            disabled={busy}
            onPress={async () => {
              setBusy(true);
              setError(null);
              try {
                const { error } = await supabase.from('driver_profiles').update({
                  status: 'submitted',
                  submitted_at: new Date().toISOString(),
                }).eq('driver_id', uid!);
                if (error) throw error;
                router.replace('/');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Failed');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Text style={ui.btnText}>Submit for review</Text>
          </TouchableOpacity>
        </>
      ),
    },
  ];

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={ui.h1}>Driver registration</Text>
      <Text style={[ui.muted, { marginBottom: 20 }]}>Step {Math.min(step + 1, steps.length)} of {steps.length}</Text>
      <View style={ui.card}>
        <Text style={ui.h2}>{steps[Math.min(step, steps.length - 1)].title}</Text>
        {error && <Text style={ui.error}>{error}</Text>}
        {steps[Math.min(step, steps.length - 1)].body}
      </View>
      {step > 0 && (
        <TouchableOpacity onPress={() => setStep((s) => s - 1)}>
          <Text style={{ color: colors.muted, textAlign: 'center' }}>← Back</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

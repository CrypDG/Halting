import { supabase } from './supabase';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

async function call(body: Record<string, unknown>) {
  const res = await fetch(`${url}/functions/v1/phone-auth`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

/** Returns the dev OTP while SMS is mocked (no gateway yet); null once real SMS ships. */
export async function requestOtp(phone: string): Promise<string | null> {
  const res = await call({ action: 'request', phone });
  return res.dev_otp ?? null;
}

/** Verifies the code and signs the user in. Returns true if this is a brand-new account. */
export async function verifyOtp(phone: string, code: string): Promise<boolean> {
  const res = await call({ action: 'verify', phone, code, role: 'driver' });
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: res.token_hash });
  if (error) throw new Error(error.message);
  return !!res.is_new;
}

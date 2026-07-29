import { errorResponse, handleOptions, HttpError, json, serviceClient } from '../_shared/common.ts';

/**
 * Mobile-OTP authentication (PRD §3.1/§3.2 step 1). Pre-auth endpoint:
 * callers hold only the anon key.
 *
 *  { action: 'request', phone: '9876543210' }
 *    -> mints a 6-digit code, "sends" it by SMS. The SMS gateway is MOCKED
 *       (no paid provider yet): the code is logged and — DEV ONLY — returned
 *       as dev_otp so the app can show it. Remove dev_otp when a real
 *       gateway (MSG91/Twilio) replaces mockSms below.
 *
 *  { action: 'verify', phone, code, role?: 'driver' | 'customer' }
 *    -> checks the code, creates the account on first login (role from the
 *       calling app), and returns a one-time token_hash the client redeems
 *       at /auth/v1/verify for a real session.
 *
 * Phone accounts are keyed by an internal email alias (p<digits>@phone.acting)
 * because GoTrue's native SMS sign-in also requires a paid SMS provider.
 */
const OTP_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function normalizePhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '');
  const ten = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(ten)) throw new HttpError(400, 'Enter a valid 10-digit Indian mobile number');
  return `+91${ten}`;
}

const aliasFor = (phone: string) => `p${phone.replace(/\D/g, '')}@phone.acting`;

// Mock SMS — swap for a real gateway later (same shape as shared MockSmsSender).
async function mockSms(phone: string, message: string) {
  console.log(`[mock-sms] to=${phone}: ${message}`);
}

Deno.serve(async (req: Request) => {
  const opt = handleOptions(req);
  if (opt) return opt;
  try {
    const supa = serviceClient();
    const body = await req.json();
    const action = body.action;
    const phone = normalizePhone(body.phone);

    if (action === 'request') {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const { error } = await supa.from('phone_otps').upsert({
        phone,
        code,
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
        attempts: 0,
      });
      if (error) throw new HttpError(500, error.message);
      await mockSms(phone, `${code} is your Acting login code. Valid for 5 minutes.`);
      // DEV ONLY — delete this field once a real SMS gateway is wired in.
      return json({ ok: true, dev_otp: code });
    }

    if (action === 'verify') {
      const code = String(body.code ?? '').trim();
      if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'Enter the 6-digit code');

      const { data: row } = await supa.from('phone_otps').select('*').eq('phone', phone).maybeSingle();
      if (!row) throw new HttpError(400, 'Request a code first');
      if (new Date(row.expires_at) < new Date()) throw new HttpError(410, 'Code expired — request a new one');
      if (row.attempts >= MAX_ATTEMPTS) throw new HttpError(429, 'Too many attempts — request a new code');
      if (row.code !== code) {
        await supa.from('phone_otps').update({ attempts: row.attempts + 1 }).eq('phone', phone);
        throw new HttpError(403, 'Incorrect code');
      }
      await supa.from('phone_otps').delete().eq('phone', phone);

      // First login creates the account; role comes from which app is calling.
      const role = body.role === 'customer' ? 'customer' : 'driver';
      const email = aliasFor(phone);
      let isNew = false;

      const { data: created, error: createErr } = await supa.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { role, phone },
      });
      if (createErr) {
        const msg = String(createErr.message ?? '');
        if (!/already|exists|registered/i.test(msg)) throw new HttpError(500, msg);
      } else if (created?.user) {
        isNew = true;
        await supa.from('profiles').update({ phone }).eq('id', created.user.id);
      }

      const { data: link, error: linkErr } = await supa.auth.admin.generateLink({ type: 'magiclink', email });
      if (linkErr || !link?.properties?.hashed_token) {
        throw new HttpError(500, linkErr?.message ?? 'Could not create session token');
      }
      return json({ ok: true, token_hash: link.properties.hashed_token, is_new: isNew });
    }

    throw new HttpError(400, `Unknown action: ${action}`);
  } catch (e) {
    return errorResponse(e);
  }
});

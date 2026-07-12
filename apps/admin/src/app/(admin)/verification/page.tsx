'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAction, supabase } from '@/lib/supabase';

type QueueRow = {
  driver_id: string;
  status: string;
  license_number: string | null;
  license_classes: string[];
  license_expiry: string | null;
  license_verified_at: string | null;
  police_cert_path: string | null;
  police_cert_expiry: string | null;
  experience_years: number | null;
  submitted_at: string | null;
  profiles: { full_name: string | null; phone: string | null; masked_aadhaar: string | null; kyc_verified_at: string | null };
  driver_categories: Array<{ category_slug: string; price_per_km: number | null; price_per_day: number | null }>;
};

export default function VerificationPage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from('driver_profiles')
      .select(
        'driver_id, status, license_number, license_classes, license_expiry, license_verified_at, police_cert_path, police_cert_expiry, experience_years, submitted_at, profiles!driver_profiles_driver_id_fkey(full_name, phone, masked_aadhaar, kyc_verified_at), driver_categories(category_slug, price_per_km, price_per_day)',
      )
      .in('status', ['submitted', 'under_review'])
      .order('submitted_at', { ascending: true });
    if (error) setMsg(error.message);
    setRows((data as unknown as QueueRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(driverId: string, action: 'approve_driver' | 'reject_driver') {
    setBusyId(driverId);
    setMsg(null);
    try {
      const reason = action === 'reject_driver' ? window.prompt('Rejection reason:') : undefined;
      if (action === 'reject_driver' && !reason) return;
      await adminAction({ action, driver_id: driverId, reason });
      setMsg(`Driver ${action === 'approve_driver' ? 'approved' : 'rejected'}.`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold">Verification queue</h2>
      <p className="mb-6 text-sm text-slate-500">
        Review Aadhaar eKYC, Sarathi license result and the police certificate, then approve or reject.
      </p>
      {msg && <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm">{msg}</p>}
      {rows.length === 0 && <p className="text-slate-500">No drivers awaiting review 🎉</p>}
      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.driver_id} className="max-w-4xl rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold">{r.profiles?.full_name ?? 'Unnamed driver'}</p>
                <p className="text-sm text-slate-500">
                  Submitted {r.submitted_at ? new Date(r.submitted_at).toLocaleString() : '—'} · {r.experience_years ?? '?'} yrs experience
                </p>
              </div>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">{r.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <p><span className="text-slate-500">Aadhaar:</span> {r.profiles?.masked_aadhaar ?? '—'} {r.profiles?.kyc_verified_at ? '✅' : '❌ not verified'}</p>
              <p><span className="text-slate-500">License:</span> {r.license_number ?? '—'} {r.license_verified_at ? '✅' : '❌'}</p>
              <p><span className="text-slate-500">Classes:</span> {r.license_classes?.join(', ') || '—'} (expires {r.license_expiry ?? '—'})</p>
              <p><span className="text-slate-500">Police cert:</span> {r.police_cert_path ? `uploaded ✅ (valid till ${r.police_cert_expiry ?? '?'})` : '❌ missing'}</p>
              <p className="col-span-2">
                <span className="text-slate-500">Categories & rates:</span>{' '}
                {r.driver_categories?.map((c) => `${c.category_slug} (${c.price_per_km ? `₹${c.price_per_km}/km` : ''}${c.price_per_km && c.price_per_day ? ', ' : ''}${c.price_per_day ? `₹${c.price_per_day}/day` : ''})`).join(' · ') || '—'}
              </p>
            </div>
            <div className="mt-4 flex gap-3">
              <button
                disabled={busyId === r.driver_id}
                onClick={() => act(r.driver_id, 'approve_driver')}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={busyId === r.driver_id}
                onClick={() => act(r.driver_id, 'reject_driver')}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Reject…
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

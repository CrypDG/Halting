'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAction, supabase } from '@/lib/supabase';

type Event = {
  id: string;
  driver_id: string;
  trip_id: string | null;
  kind: string;
  result: string;
  risk_score: number;
  risk_reasons: string[];
  match_score: number | null;
  liveness_passed: boolean | null;
  selfie_path: string | null;
  device_id: string | null;
  category_slug: string | null;
  fail_closed: boolean;
  created_at: string;
  driver_profiles: { identity_hold: boolean; profiles: { full_name: string | null } | null } | null;
};

const RESULT_BADGE: Record<string, string> = {
  passed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  blocked: 'bg-red-100 text-red-800',
  skipped_offline: 'bg-amber-100 text-amber-800',
};

const REASON_LABEL: Record<string, string> = {
  never_verified: 'never verified',
  stale_verification: 'stale check',
  new_device: 'new device',
  recent_failure: 'recent failure',
  location_jump: 'location jump',
  high_risk_category: 'high-risk vehicle',
  new_driver: 'new driver',
  night_trip: 'night trip',
};

export default function IdentityPage() {
  const [rows, setRows] = useState<Event[]>([]);
  const [filter, setFilter] = useState<'attention' | 'all'>('attention');
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const base = supabase()
      .from('verification_events')
      .select('id, driver_id, trip_id, kind, result, risk_score, risk_reasons, match_score, liveness_passed, selfie_path, device_id, category_slug, fail_closed, created_at, driver_profiles!verification_events_driver_id_fkey(identity_hold, profiles!driver_profiles_driver_id_fkey(full_name))');
    const filtered = filter === 'attention' ? base.in('result', ['failed', 'blocked']) : base;
    const { data, error } = await filtered.order('created_at', { ascending: false }).limit(100);
    if (error) setMsg(error.message);
    setRows((data as unknown as Event[]) ?? []);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function view(row: Event) {
    if (!row.selfie_path) return;
    setMsg(null);
    try {
      const res = (await adminAction({ action: 'document_url', file_path: row.selfie_path })) as { url: string };
      setPreview({ id: row.id, url: res.url });
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not load the selfie'); }
  }

  async function hold(row: Event, on: boolean) {
    const reason = on ? window.prompt('Reason for the identity hold (shown to the driver):') : window.prompt('Note for the audit trail (optional):') ?? '';
    if (on && !reason) return;
    setBusy(row.id); setMsg(null);
    try {
      await adminAction({ action: on ? 'set_identity_hold' : 'clear_identity_hold', driver_id: row.driver_id, reason });
      await load();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Failed'); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold">Identity verification</h2>
      <p className="mb-6 max-w-3xl text-sm text-slate-500">
        Face checks run against the driver&apos;s Aadhaar reference at trip start. Device fingerprint only unlocks the app — it does not prove who is driving.
        High-risk vehicles (school bus, bus, crane, earth mover) <strong>fail closed</strong>: no passed check, no trip.
      </p>

      <div className="mb-4 flex gap-2">
        {(['attention', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            {f === 'attention' ? 'Needs attention' : 'All checks'}
          </button>
        ))}
      </div>

      {msg && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
      {rows.length === 0 && <p className="text-slate-500">No failed or blocked checks 🎉</p>}

      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="max-w-4xl rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold">
                  {r.driver_profiles?.profiles?.full_name ?? r.driver_id.slice(0, 8)}
                  {r.driver_profiles?.identity_hold && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">ON HOLD</span>}
                </p>
                <p className="text-sm text-slate-500">
                  {r.kind.replaceAll('_', ' ')} · {r.category_slug ?? '—'} · {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESULT_BADGE[r.result] ?? ''}`}>{r.result}</span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-x-6 gap-y-1 text-sm">
              <p><span className="text-slate-500">Risk:</span> {r.risk_score}</p>
              <p><span className="text-slate-500">Match:</span> {r.match_score ?? '—'}</p>
              <p><span className="text-slate-500">Liveness:</span> {r.liveness_passed == null ? '—' : r.liveness_passed ? 'pass' : 'fail'}</p>
              <p><span className="text-slate-500">Fail-closed:</span> {r.fail_closed ? 'yes' : 'no'}</p>
            </div>

            {r.risk_reasons?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {r.risk_reasons.map((x) => (
                  <span key={x} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{REASON_LABEL[x] ?? x}</span>
                ))}
              </div>
            )}

            {preview?.id === r.id && (
              <img src={preview.url} alt="Verification selfie" className="mt-4 max-h-72 rounded-lg border border-slate-200" />
            )}

            <div className="mt-4 flex gap-3">
              {r.selfie_path && (
                <button onClick={() => view(r)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                  {preview?.id === r.id ? 'Reload selfie' : 'View selfie'}
                </button>
              )}
              {r.driver_profiles?.identity_hold ? (
                <button disabled={busy === r.id} onClick={() => hold(r, false)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Clear hold
                </button>
              ) : (
                <button disabled={busy === r.id} onClick={() => hold(r, true)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Put on hold…
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

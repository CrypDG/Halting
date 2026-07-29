'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAction, supabase } from '@/lib/supabase';

type Row = {
  id: string;
  owner_id: string;
  doc_type: string;
  file_path: string;
  doc_number: string | null;
  provider: string | null;
  expires_on: string | null;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  document_types: { name: string; category: string; applies_to: string; required: boolean } | null;
  profiles: { full_name: string | null; role: string } | null;
};

const BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  verified: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800',
  expired: 'bg-red-100 text-red-800',
};

export default function DocumentsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const base = supabase()
      .from('user_documents')
      .select('id, owner_id, doc_type, file_path, doc_number, provider, expires_on, status, rejection_reason, created_at, document_types(name, category, applies_to, required), profiles!user_documents_owner_id_fkey(full_name, role)');
    const filtered = filter === 'pending' ? base.eq('status', 'pending') : base;
    const { data, error } = await filtered.order('created_at', { ascending: true });
    if (error) setMsg(error.message);
    setRows((data as unknown as Row[]) ?? []);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function view(row: Row) {
    setMsg(null);
    try {
      const res = (await adminAction({ action: 'document_url', file_path: row.file_path })) as { url: string };
      setPreview({ id: row.id, url: res.url });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not load document');
    }
  }

  async function act(row: Row, verify: boolean) {
    const reason = verify ? undefined : window.prompt('Reason for rejection (shown to the user):');
    if (!verify && !reason) return;
    setBusy(row.id);
    setMsg(null);
    try {
      await adminAction({ action: verify ? 'verify_document' : 'reject_document', document_id: row.id, reason });
      setPreview(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold">Documents &amp; insurance</h2>
      <p className="mb-6 text-sm text-slate-500">
        Driver cover and endorsements, plus customer vehicle paperwork. Approving marks the document valid until its expiry date.
      </p>

      <div className="mb-4 flex gap-2">
        {(['pending', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === f ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
          >
            {f === 'pending' ? 'Awaiting review' : 'All documents'}
          </button>
        ))}
      </div>

      {msg && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
      {rows.length === 0 && <p className="text-slate-500">Nothing awaiting review 🎉</p>}

      <div className="space-y-4">
        {rows.map((r) => (
          <div key={r.id} className="max-w-4xl rounded-xl bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-semibold">{r.document_types?.name ?? r.doc_type}</p>
                <p className="text-sm text-slate-500">
                  {r.profiles?.full_name ?? r.owner_id.slice(0, 8)} · {r.profiles?.role} · submitted {new Date(r.created_at).toLocaleString()}
                </p>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status] ?? ''}`}>{r.status}</span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-x-8 gap-y-1 text-sm">
              <p><span className="text-slate-500">Number:</span> {r.doc_number ?? '—'}</p>
              <p><span className="text-slate-500">Issuer:</span> {r.provider ?? '—'}</p>
              <p><span className="text-slate-500">Expires:</span> {r.expires_on ?? '—'}</p>
            </div>
            {r.rejection_reason && <p className="mt-2 text-sm text-red-600">Rejected: {r.rejection_reason}</p>}

            {preview?.id === r.id && (
              <img src={preview.url} alt={r.document_types?.name ?? 'Document'} className="mt-4 max-h-96 rounded-lg border border-slate-200" />
            )}

            <div className="mt-4 flex gap-3">
              <button onClick={() => view(r)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50">
                {preview?.id === r.id ? 'Reload image' : 'View document'}
              </button>
              {r.status !== 'verified' && (
                <button disabled={busy === r.id} onClick={() => act(r, true)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Approve
                </button>
              )}
              {r.status !== 'rejected' && (
                <button disabled={busy === r.id} onClick={() => act(r, false)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  Reject…
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

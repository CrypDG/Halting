'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAction, supabase } from '@/lib/supabase';

type DriverRow = {
  driver_id: string;
  status: string;
  license_classes: string[];
  trips_completed: number;
  rating_avg: number | null;
  rejection_reason: string | null;
  profiles: { full_name: string | null; phone: string | null };
};

const BADGE: Record<string, string> = {
  approved: 'bg-emerald-100 text-emerald-800',
  submitted: 'bg-amber-100 text-amber-800',
  under_review: 'bg-amber-100 text-amber-800',
  rejected: 'bg-red-100 text-red-800',
  suspended: 'bg-red-100 text-red-800',
  draft: 'bg-slate-100 text-slate-600',
};

export default function DriversPage() {
  const [rows, setRows] = useState<DriverRow[]>([]);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase()
      .from('driver_profiles')
      .select('driver_id, status, license_classes, trips_completed, rating_avg, rejection_reason, profiles!driver_profiles_driver_id_fkey(full_name, phone)')
      .order('created_at', { ascending: false });
    setRows((data as unknown as DriverRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(driverId: string, action: 'suspend_driver' | 'reinstate_driver') {
    setMsg(null);
    try {
      const reason = action === 'suspend_driver' ? window.prompt('Suspension reason:') ?? undefined : undefined;
      await adminAction({ action, driver_id: driverId, reason });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  }

  const filtered = rows.filter(
    (r) => !q || (r.profiles?.full_name ?? '').toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Drivers</h2>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name…"
        className="mb-4 w-72 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {msg && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
      <table className="w-full max-w-5xl border-collapse rounded-xl bg-white text-sm shadow-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="p-3">Name</th>
            <th className="p-3">Status</th>
            <th className="p-3">License classes</th>
            <th className="p-3">Trips</th>
            <th className="p-3">Rating</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.driver_id} className="border-b border-slate-100">
              <td className="p-3 font-medium">{r.profiles?.full_name ?? '—'}</td>
              <td className="p-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE[r.status] ?? ''}`}>{r.status}</span>
                {r.rejection_reason && <p className="mt-1 text-xs text-slate-400">{r.rejection_reason}</p>}
              </td>
              <td className="p-3">{r.license_classes?.join(', ') || '—'}</td>
              <td className="p-3">{r.trips_completed}</td>
              <td className="p-3">{r.rating_avg ?? '—'}</td>
              <td className="p-3">
                {r.status === 'approved' && (
                  <button onClick={() => act(r.driver_id, 'suspend_driver')} className="text-red-600 hover:underline">
                    Suspend
                  </button>
                )}
                {r.status === 'suspended' && (
                  <button onClick={() => act(r.driver_id, 'reinstate_driver')} className="text-emerald-600 hover:underline">
                    Reinstate
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

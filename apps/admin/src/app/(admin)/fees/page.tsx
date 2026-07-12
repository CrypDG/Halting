'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAction, supabase } from '@/lib/supabase';

type FeeRow = {
  driver_id: string;
  amount_inr: number;
  status: string;
  due_at: string;
  paid_at: string | null;
  payment_ref: string | null;
  driver_profiles: { profiles: { full_name: string | null } };
};

export default function FeesPage() {
  const [rows, setRows] = useState<FeeRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase()
      .from('setup_fees')
      .select('driver_id, amount_inr, status, due_at, paid_at, payment_ref, driver_profiles!setup_fees_driver_id_fkey(profiles!driver_profiles_driver_id_fkey(full_name))')
      .order('due_at', { ascending: true });
    setRows((data as unknown as FeeRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function act(driverId: string, action: 'mark_fee_paid' | 'waive_fee') {
    setMsg(null);
    try {
      await adminAction({ action, driver_id: driverId });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold">Setup fees (₹500)</h2>
      <p className="mb-6 text-sm text-slate-500">
        Due after a driver&apos;s first completed trip. Overdue unpaid fees block the driver from going online.
      </p>
      {msg && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
      <table className="w-full max-w-4xl border-collapse rounded-xl bg-white text-sm shadow-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="p-3">Driver</th>
            <th className="p-3">Amount</th>
            <th className="p-3">Status</th>
            <th className="p-3">Due</th>
            <th className="p-3">Paid</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const overdue = r.status === 'pending' && new Date(r.due_at) < new Date();
            return (
              <tr key={r.driver_id} className="border-b border-slate-100">
                <td className="p-3 font-medium">{r.driver_profiles?.profiles?.full_name ?? '—'}</td>
                <td className="p-3">₹{r.amount_inr}</td>
                <td className="p-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    r.status === 'paid' ? 'bg-emerald-100 text-emerald-800'
                      : r.status === 'waived' ? 'bg-slate-100 text-slate-600'
                      : overdue ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {overdue ? 'overdue' : r.status}
                  </span>
                </td>
                <td className="p-3">{new Date(r.due_at).toLocaleString()}</td>
                <td className="p-3">{r.paid_at ? `${new Date(r.paid_at).toLocaleString()} (${r.payment_ref ?? ''})` : '—'}</td>
                <td className="p-3 whitespace-nowrap">
                  {r.status === 'pending' && (
                    <>
                      <button onClick={() => act(r.driver_id, 'mark_fee_paid')} className="mr-3 text-emerald-600 hover:underline">Mark paid</button>
                      <button onClick={() => act(r.driver_id, 'waive_fee')} className="text-slate-600 hover:underline">Waive</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

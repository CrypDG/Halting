'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminAction, supabase } from '@/lib/supabase';

type TripRow = {
  id: string;
  status: string;
  trip_type: string;
  category_slug: string;
  pickup_address: string | null;
  destination_address: string | null;
  payment_mode: string;
  payment_status: string;
  fare_total: number | null;
  requested_at: string;
  customer: { full_name: string | null } | null;
  driver: { profiles: { full_name: string | null } } | null;
};

const ACTIVE = ['requested', 'accepted', 'driver_arrived', 'started', 'in_progress', 'completed', 'paid', 'disputed'];

export default function TripsPage() {
  const [rows, setRows] = useState<TripRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase()
      .from('trips')
      .select(
        'id, status, trip_type, category_slug, pickup_address, destination_address, payment_mode, payment_status, fare_total, requested_at, customer:profiles!trips_customer_id_fkey(full_name), driver:driver_profiles!trips_driver_id_fkey(profiles!driver_profiles_driver_id_fkey(full_name))',
      )
      .order('requested_at', { ascending: false })
      .limit(100);
    if (error) setMsg(error.message);
    setRows((data as unknown as TripRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function forceClose(tripId: string) {
    if (!window.confirm('Force-close this trip?')) return;
    try {
      await adminAction({ action: 'force_close_trip', trip_id: tripId });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  }

  async function adjustFare(tripId: string) {
    const v = window.prompt('New fare total (₹):');
    if (!v) return;
    try {
      await adminAction({ action: 'adjust_fare', trip_id: tripId, fare_total: Number(v) });
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Trips</h2>
      {msg && <p className="mb-4 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{msg}</p>}
      <table className="w-full border-collapse rounded-xl bg-white text-sm shadow-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="p-3">Requested</th>
            <th className="p-3">Customer</th>
            <th className="p-3">Driver</th>
            <th className="p-3">Category</th>
            <th className="p-3">Route</th>
            <th className="p-3">Status</th>
            <th className="p-3">Payment</th>
            <th className="p-3">Fare</th>
            <th className="p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="p-3 whitespace-nowrap">{new Date(r.requested_at).toLocaleString()}</td>
              <td className="p-3">{r.customer?.full_name ?? '—'}</td>
              <td className="p-3">{r.driver?.profiles?.full_name ?? '—'}</td>
              <td className="p-3">{r.category_slug} · {r.trip_type}</td>
              <td className="p-3 max-w-56 truncate">{r.pickup_address ?? '?'} → {r.destination_address ?? '—'}</td>
              <td className="p-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r.status}</span></td>
              <td className="p-3">{r.payment_mode} · {r.payment_status}</td>
              <td className="p-3">{r.fare_total != null ? `₹${r.fare_total}` : '—'}</td>
              <td className="p-3 whitespace-nowrap">
                {ACTIVE.includes(r.status) && (
                  <button onClick={() => forceClose(r.id)} className="mr-3 text-red-600 hover:underline">Force close</button>
                )}
                {r.fare_total != null && r.status !== 'closed' && (
                  <button onClick={() => adjustFare(r.id)} className="text-slate-600 hover:underline">Adjust fare</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

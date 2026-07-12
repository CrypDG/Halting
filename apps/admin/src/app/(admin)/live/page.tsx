'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type PresenceRow = {
  driver_id: string;
  status: string;
  last_seen_at: string | null;
  driver_profiles: { profiles: { full_name: string | null } };
};

type ActiveTrip = {
  id: string;
  status: string;
  category_slug: string;
  pickup_address: string | null;
  customer: { full_name: string | null } | null;
};

export default function LiveOpsPage() {
  const [presence, setPresence] = useState<PresenceRow[]>([]);
  const [trips, setTrips] = useState<ActiveTrip[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      const sb = supabase();
      const [{ data: p }, { data: t }] = await Promise.all([
        sb
          .from('driver_presence')
          .select('driver_id, status, last_seen_at, driver_profiles!driver_presence_driver_id_fkey(profiles!driver_profiles_driver_id_fkey(full_name))')
          .in('status', ['online', 'busy']),
        sb
          .from('trips')
          .select('id, status, category_slug, pickup_address, customer:profiles!trips_customer_id_fkey(full_name)')
          .in('status', ['requested', 'accepted', 'driver_arrived', 'started', 'in_progress']),
      ]);
      if (!alive) return;
      setPresence((p as unknown as PresenceRow[]) ?? []);
      setTrips((t as unknown as ActiveTrip[]) ?? []);
      setUpdatedAt(new Date());
    }
    load();
    const iv = setInterval(load, 10_000); // PRD §6: ≤10s staleness
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, []);

  return (
    <div>
      <h2 className="mb-1 text-2xl font-bold">Live ops</h2>
      <p className="mb-6 text-sm text-slate-500">
        Auto-refreshes every 10 s{updatedAt ? ` · last update ${updatedAt.toLocaleTimeString()}` : ''}
      </p>
      <div className="grid max-w-5xl grid-cols-2 gap-6">
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold">Drivers online ({presence.length})</h3>
          {presence.length === 0 && <p className="text-sm text-slate-500">Nobody online.</p>}
          <ul className="space-y-2 text-sm">
            {presence.map((p) => (
              <li key={p.driver_id} className="flex items-center justify-between">
                <span>{p.driver_profiles?.profiles?.full_name ?? p.driver_id.slice(0, 8)}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === 'busy' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                  {p.status}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 font-semibold">Active trips ({trips.length})</h3>
          {trips.length === 0 && <p className="text-sm text-slate-500">No active trips.</p>}
          <ul className="space-y-2 text-sm">
            {trips.map((t) => (
              <li key={t.id} className="flex items-center justify-between">
                <span>
                  {t.customer?.full_name ?? '—'} · {t.category_slug} · {t.pickup_address ?? '?'}
                </span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{t.status}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

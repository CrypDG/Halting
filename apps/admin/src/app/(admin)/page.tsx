'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type Stats = {
  pendingReview: number;
  approvedDrivers: number;
  onlineDrivers: number;
  activeTrips: number;
  closedTrips: number;
  pendingFees: number;
};

export default function OverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const count = async (table: string, filter: (q: any) => any) => {
        const { count } = await filter(sb.from(table).select('*', { count: 'exact', head: true }));
        return count ?? 0;
      };
      setStats({
        pendingReview: await count('driver_profiles', (q) => q.in('status', ['submitted', 'under_review'])),
        approvedDrivers: await count('driver_profiles', (q) => q.eq('status', 'approved')),
        onlineDrivers: await count('driver_presence', (q) => q.in('status', ['online', 'busy'])),
        activeTrips: await count('trips', (q) =>
          q.in('status', ['requested', 'accepted', 'driver_arrived', 'started', 'in_progress']),
        ),
        closedTrips: await count('trips', (q) => q.eq('status', 'closed')),
        pendingFees: await count('setup_fees', (q) => q.eq('status', 'pending')),
      });
    })();
  }, []);

  const cards: Array<[string, number | undefined]> = [
    ['Drivers awaiting review', stats?.pendingReview],
    ['Approved drivers', stats?.approvedDrivers],
    ['Online / busy now', stats?.onlineDrivers],
    ['Active trips', stats?.activeTrips],
    ['Closed trips', stats?.closedTrips],
    ['Setup fees pending', stats?.pendingFees],
  ];

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Overview</h2>
      <div className="grid max-w-4xl grid-cols-3 gap-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">{label}</p>
            <p className="mt-1 text-3xl font-bold">{value ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

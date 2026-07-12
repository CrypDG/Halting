'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type LimitRow = {
  category_slug: string;
  min_per_km: number | null;
  max_per_km: number | null;
  min_per_day: number | null;
  max_per_day: number | null;
};

export default function PricingPage() {
  const [rows, setRows] = useState<LimitRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase().from('pricing_limits').select('*').order('category_slug');
    setRows((data as LimitRow[]) ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function setField(slug: string, field: keyof LimitRow, value: string) {
    setRows((rs) => rs.map((r) => (r.category_slug === slug ? { ...r, [field]: value === '' ? null : Number(value) } : r)));
  }

  async function save(row: LimitRow) {
    setMsg(null);
    const { error } = await supabase()
      .from('pricing_limits')
      .update({
        min_per_km: row.min_per_km,
        max_per_km: row.max_per_km,
        min_per_day: row.min_per_day,
        max_per_day: row.max_per_day,
      })
      .eq('category_slug', row.category_slug);
    setMsg(error ? error.message : `Saved ${row.category_slug}.`);
  }

  const num = (v: number | null) => (v == null ? '' : String(v));

  return (
    <div>
      <h2 className="mb-2 text-2xl font-bold">Pricing limits</h2>
      <p className="mb-6 text-sm text-slate-500">
        Floor/ceiling per category — driver-set rates outside these bounds are rejected.
      </p>
      {msg && <p className="mb-4 rounded-lg bg-slate-100 px-4 py-2 text-sm">{msg}</p>}
      <table className="w-full max-w-3xl border-collapse rounded-xl bg-white text-sm shadow-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="p-3">Category</th>
            <th className="p-3">Min ₹/km</th>
            <th className="p-3">Max ₹/km</th>
            <th className="p-3">Min ₹/day</th>
            <th className="p-3">Max ₹/day</th>
            <th className="p-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.category_slug} className="border-b border-slate-100">
              <td className="p-3 font-medium">{r.category_slug}</td>
              {(['min_per_km', 'max_per_km', 'min_per_day', 'max_per_day'] as const).map((f) => (
                <td key={f} className="p-2">
                  <input
                    type="number"
                    value={num(r[f])}
                    onChange={(e) => setField(r.category_slug, f, e.target.value)}
                    className="w-24 rounded border border-slate-300 px-2 py-1"
                  />
                </td>
              ))}
              <td className="p-3">
                <button onClick={() => save(r)} className="text-emerald-600 hover:underline">Save</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

type CustomerRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  masked_aadhaar: string | null;
  kyc_verified_at: string | null;
  created_at: string;
};

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase()
        .from('profiles')
        .select('id, full_name, phone, masked_aadhaar, kyc_verified_at, created_at')
        .eq('role', 'customer')
        .order('created_at', { ascending: false });
      setRows((data as CustomerRow[]) ?? []);
    })();
  }, []);

  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold">Customers</h2>
      <table className="w-full max-w-4xl border-collapse rounded-xl bg-white text-sm shadow-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="p-3">Name</th>
            <th className="p-3">Phone</th>
            <th className="p-3">Aadhaar (masked)</th>
            <th className="p-3">KYC</th>
            <th className="p-3">Joined</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="p-3 font-medium">{r.full_name ?? '—'}</td>
              <td className="p-3">{r.phone ?? '—'}</td>
              <td className="p-3">{r.masked_aadhaar ?? '—'}</td>
              <td className="p-3">{r.kyc_verified_at ? '✅ verified' : '❌ pending'}</td>
              <td className="p-3">{new Date(r.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

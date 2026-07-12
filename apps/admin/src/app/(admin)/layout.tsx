'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const NAV = [
  { href: '/', label: 'Overview' },
  { href: '/verification', label: 'Verification queue' },
  { href: '/drivers', label: 'Drivers' },
  { href: '/customers', label: 'Customers' },
  { href: '/trips', label: 'Trips' },
  { href: '/live', label: 'Live ops' },
  { href: '/fees', label: 'Setup fees' },
  { href: '/pricing', label: 'Pricing limits' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase().auth.getSession();
      if (!data.session) {
        router.replace('/login');
        return;
      }
      const { data: prof } = await supabase()
        .from('profiles')
        .select('role')
        .eq('id', data.session.user.id)
        .single();
      if (prof?.role !== 'admin') {
        router.replace('/login');
        return;
      }
      setReady(true);
    })();
  }, [router]);

  if (!ready) return <main className="grid min-h-screen place-items-center text-slate-500">Loading…</main>;

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-slate-200 bg-white p-4">
        <h1 className="mb-6 px-2 text-lg font-bold">Halting Ops</h1>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`block rounded-lg px-3 py-2 text-sm font-medium ${
                pathname === n.href ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={async () => {
            await supabase().auth.signOut();
            router.replace('/login');
          }}
          className="mt-8 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
        >
          Sign out
        </button>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

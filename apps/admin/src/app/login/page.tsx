'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    const { data: sess } = await supabase().auth.getSession();
    const { data: prof } = await supabase()
      .from('profiles')
      .select('role')
      .eq('id', sess.session!.user.id)
      .single();
    if (prof?.role !== 'admin') {
      await supabase().auth.signOut();
      setError('This account is not an admin');
      setBusy(false);
      return;
    }
    router.replace('/');
  }

  return (
    <main className="min-h-screen grid place-items-center">
      <form onSubmit={signIn} className="w-96 rounded-xl bg-white p-8 shadow">
        <h1 className="mb-1 text-2xl font-bold">Halting Admin</h1>
        <p className="mb-6 text-sm text-slate-500">Operations panel sign-in</p>
        <label className="mb-3 block">
          <span className="mb-1 block text-sm font-medium">Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
            placeholder="admin@halting.dev"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-sm font-medium">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-slate-900 py-2 font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}

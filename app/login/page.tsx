"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    router.replace("/sales");
    router.refresh();
  }

  return <main className="flex min-h-screen items-center justify-center px-4"><form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><div><h1 className="text-2xl font-bold text-slate-900">Restaurant POS</h1><p className="mt-1 text-sm text-slate-500">Sign in to continue</p></div><label className="block text-sm font-medium text-slate-700">Email<input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base" /></label><label className="block text-sm font-medium text-slate-700">Password<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-base" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-brand-600 px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60">{loading ? "Signing in…" : "Sign in"}</button></form></main>;
}

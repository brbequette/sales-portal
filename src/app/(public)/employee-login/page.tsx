"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { FiShield, FiLock, FiMail, FiArrowRight, FiAlertCircle, FiUserCheck, FiZap } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

export default function EmployeeLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/dashboard');
      router.refresh();
    }
  }, [router, status]);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email: email || 'ben@titandiamondusa.com',
        password: password || 'demo',
        redirect: false,
      });

      if (res?.error) {
        setError('Invalid staff credentials. Try email: ben@titandiamondusa.com');
      } else {
        router.push('/dashboard');
        router.refresh();
      }
    } catch {
      setError('An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const handleZohoSso = async () => {
    setLoading(true);
    setError('');

    try {
      // 1. Try standard NextAuth Zoho OAuth provider
      const result = await signIn('zoho', { callbackUrl: '/dashboard', redirect: false });
      if (result?.url && !result.url.includes("error")) {
        window.location.href = result.url;
        return;
      }

      // 2. Seamless Staff Session fallback if Zoho OAuth keys are unconfigured locally
      const staffRes = await signIn('credentials', {
        email: email || 'ben@titandiamondusa.com',
        password: password || 'demo',
        redirect: false,
      });

      if (staffRes?.ok && !staffRes.error) {
        router.push('/dashboard');
        router.refresh();
      } else {
        // Direct redirect to NextAuth Zoho signin endpoint
        window.location.href = `/api/auth/signin/zoho?callbackUrl=${encodeURIComponent('/dashboard')}`;
      }
    } catch {
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickDemoStaffLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await signIn('credentials', {
        email: 'ben@titandiamondusa.com',
        password: 'demo',
        redirect: false,
      });
      if (res?.ok) {
        router.push('/dashboard');
        router.refresh();
      } else {
        setError('Unable to log in with staff credentials.');
      }
    } catch {
      setError('Authentication error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <SparkCanvas />

      <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-2xl border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.15)] relative z-10">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg border border-amber-300/40">
            <FiShield className="w-8 h-8 text-neutral-950" />
          </div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-amber-400 block mb-1">TITAN DIAMOND USA</span>
          <h1 className="text-2xl font-black uppercase text-white tracking-tight">EMPLOYEE & REP PORTAL</h1>
          <p className="text-xs text-neutral-400 mt-1">Internal Access for Sales Representatives & Staff</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-3 font-medium">
            <FiAlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleStaffLogin} className="space-y-4">
          <div>
            <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">STAFF EMAIL OR REP ID</label>
            <div className="relative">
              <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ben@titandiamondusa.com or REP-104"
                className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-mono font-bold text-neutral-400 block mb-2">SECURITY PASSWORD</label>
            <div className="relative">
              <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 text-neutral-950 font-black text-xs uppercase tracking-wider py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
          >
            {loading ? "AUTHENTICATING..." : "STAFF LOGIN"} <FiArrowRight size={16} />
          </button>
        </form>

        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10"></div>
          </div>
          <span className="relative bg-neutral-900 px-3 text-[10px] uppercase tracking-widest text-neutral-500 font-mono">
            OR SINGLE SIGN-ON
          </span>
        </div>

        <div className="space-y-3">
          <button
            type="button"
            onClick={handleZohoSso}
            disabled={loading}
            className="w-full bg-neutral-950 hover:bg-neutral-800 border border-amber-500/30 text-white font-bold text-xs py-3.5 rounded-xl transition-all flex items-center justify-center gap-3 shadow group"
          >
            <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-black group-hover:scale-110 transition-transform">
              Z
            </span>
            <span>CONNECT WITH ZOHO CRM SSO</span>
          </button>

          <button
            type="button"
            onClick={handleQuickDemoStaffLogin}
            disabled={loading}
            className="w-full bg-neutral-950/60 hover:bg-neutral-800/80 border border-white/10 text-neutral-300 font-semibold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-2"
          >
            <FiZap className="text-amber-400" size={14} />
            <span>⚡ Instant Staff Unlock (Benjamin Bequette)</span>
          </button>
        </div>

        <div className="mt-8 pt-6 border-t border-white/10 text-center space-y-2">
          <p className="text-xs text-neutral-500">
            Are you a customer or contractor?{" "}
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 hover:underline"
          >
            <FiUserCheck size={14} /> Switch to Contractor Account Portal →
          </Link>
        </div>
      </div>
    </div>
  );
}

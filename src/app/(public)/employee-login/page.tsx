"use client";

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { FiShield, FiLock, FiMail, FiArrowRight, FiAlertCircle, FiUserCheck, FiZap } from 'react-icons/fi';
import { SparkCanvas } from '@/components/SparkCanvas';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role?: string;
}

function EmployeeLoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const searchParams = useSearchParams();

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam && errorParam !== 'OAuthSignin') {
      setError(`Authentication notice: ${errorParam}`);
    }

    // Dynamically fetch staff users from API database (no hardcoding)
    fetch('/api/get-users')
      .then(res => res.json())
      .then(data => {
        if (data.users && Array.isArray(data.users)) {
          const reps = data.users.filter((u: any) => u.email && u.role !== 'Customer').slice(0, 6);
          setStaffUsers(reps);
        }
      })
      .catch(() => {});
  }, [searchParams]);

  const handleStaffLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your staff email address or Rep ID.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email: email.trim(),
        password: password || 'demo',
        redirect: false,
      });

      if (res?.error) {
        setError(`Unable to authenticate ${email}. Check credentials.`);
        setLoading(false);
      } else {
        window.location.href = '/dashboard';
      }
    } catch {
      setError('An error occurred during authentication.');
      setLoading(false);
    }
  };

  const handleZohoSso = async () => {
    setLoading(true);
    setError('');

    try {
      await signIn('zoho', { callbackUrl: '/dashboard' });
    } catch {
      setError('Failed to initiate Zoho SSO authentication.');
      setLoading(false);
    }
  };

  const handleQuickRepLogin = async (repEmail: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await signIn('credentials', {
        email: repEmail,
        password: 'demo',
        redirect: false,
      });
      if (res?.ok) {
        window.location.href = '/dashboard';
      } else {
        setError(`Unable to log in as ${repEmail}.`);
        setLoading(false);
      }
    } catch {
      setError('Authentication error occurred.');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-neutral-900/90 backdrop-blur-2xl border border-amber-500/40 rounded-3xl p-6 sm:p-8 shadow-[0_0_60px_rgba(245,158,11,0.15)] relative z-10">
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-20 items-center justify-center">
          <img src="/images/logo_dark.png" alt="Titan Diamond USA" className="h-16 w-auto object-contain filter drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-amber-400 block mb-1">
          EMPLOYEE & STAFF PORTAL
        </span>
        <h1 className="text-2xl font-black uppercase tracking-tight text-white">
          Staff & Rep Login
        </h1>
        <p className="text-xs text-neutral-400 mt-1.5 leading-relaxed">
          Sign in with Zoho Single Sign-On or your Titan Staff credentials to access your account dashboard.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-center gap-3">
          <FiAlertCircle size={18} className="shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Zoho SSO Button */}
      <button
        onClick={handleZohoSso}
        disabled={loading}
        className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-neutral-950 font-black text-sm uppercase tracking-wider py-4 px-6 rounded-2xl shadow-xl hover:shadow-orange-500/25 transition-all flex items-center justify-center gap-3 mb-6 disabled:opacity-50"
      >
        <FiZap size={18} />
        {loading ? 'Connecting with Zoho...' : 'Connect with Zoho CRM SSO'}
      </button>

      <div className="relative flex py-2 items-center mb-6">
        <div className="flex-grow border-t border-white/10"></div>
        <span className="flex-shrink mx-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500">OR STAFF LOGIN</span>
        <div className="flex-grow border-t border-white/10"></div>
      </div>

      {/* Form */}
      <form onSubmit={handleStaffLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">
            Staff Email / Rep ID
          </label>
          <div className="relative">
            <FiMail className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your staff email address"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-neutral-300 uppercase tracking-wider mb-2">
            Password
          </label>
          <div className="relative">
            <FiLock className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-neutral-950 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500/60 transition-colors"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-neutral-800 hover:bg-neutral-700 text-white font-bold text-xs uppercase tracking-wider py-3.5 px-4 rounded-xl border border-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
        >
          {loading ? 'Authenticating...' : 'Sign In with Staff Account'} <FiArrowRight size={14} />
        </button>
      </form>

      {/* Dynamic Staff Quick Sign-In */}
      {staffUsers.length > 0 && (
        <div className="mt-6 pt-6 border-t border-white/10 space-y-2">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-neutral-500 text-center mb-2">ACTIVE STAFF QUICK SIGN-IN</span>
          <div className="grid grid-cols-2 gap-2">
            {staffUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => handleQuickRepLogin(user.email)}
                disabled={loading}
                className="bg-neutral-950 hover:bg-neutral-900 text-amber-400 border border-amber-500/30 text-xs font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors truncate"
              >
                <FiUserCheck size={13} className="shrink-0" /> {user.name || user.email.split('@')[0]}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 text-center text-xs text-neutral-500">
        Contractor looking to buy products?{' '}
        <Link href="/login" className="text-amber-400 hover:underline font-bold">
          Contractor Portal Login
        </Link>
      </div>
    </div>
  );
}

export default function EmployeeLoginPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <SparkCanvas />
      <Suspense fallback={<div className="text-white text-xs">Loading Staff Login...</div>}>
        <EmployeeLoginForm />
      </Suspense>
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import luckmiAppLogo from '@/app/image/logo/luckmi_app_logo.png';

export default function LoginClient() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    } else {
      router.push('/dashboard');
      router.refresh();
    }

    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    const normalizedFirstName = firstName.trim();
    const normalizedLastName = lastName.trim();
    const normalizedPhone = phone.trim();

    if (!normalizedFirstName || !normalizedLastName) {
      setLoading(false);
      setError('First name and last name are required to create an account.');
      return;
    }

    const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: normalizedFirstName,
          last_name: normalizedLastName,
          full_name: fullName,
          phone: normalizedPhone || null,
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
    } else {
      // Auto-create a Free subscription row for the new user
      if (signUpData?.user?.id) {
        try {
          await fetch('/api/subscription/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: signUpData.user.id }),
          });
        } catch {
          // Non-fatal — subscription row can be created later
        }
      }
      setInfo('Check your email for the confirmation link.');
    }

    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email first to receive a reset link.');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setInfo('Password reset link sent. Check your email.');
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0c11] px-4">
      <div className="w-full max-w-md bg-[#11151c] border border-gray-700 rounded-3xl p-8">
        <div className="text-center mb-7">
          <div className="relative flex justify-center mb-3">
            <Image
              src={luckmiAppLogo}
              alt="Luckmi app logo"
              width={144}
              height={144}
              className="h-24 w-auto"
              priority
            />
          </div>
          <h1 className="text-3xl font-bold text-white">Luckmi AI Trading Assistant</h1>
          <p className="text-gray-400 mt-2">Sign in to access your trading tools</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm text-gray-400 mb-2">First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
                placeholder="First name"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
                placeholder="Last name"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Phone (optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
              placeholder="+1 555 123 4567"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-sm text-gray-400">Password</label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-xs text-blue-400 transition hover:text-blue-300 disabled:opacity-50"
              >
                Forgot password?
              </button>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          {info && <p className="text-emerald-400 text-sm text-center">{info}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-2xl font-medium text-white transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <button
            type="button"
            onClick={handleSignUp}
            disabled={loading}
            className="w-full py-3.5 bg-gray-800 hover:bg-gray-700 rounded-2xl font-medium text-white transition-colors"
          >
            Create Account
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-8">
          This is a private trading platform. Contact admin for access.
        </p>
      </div>
    </div>
  );
}

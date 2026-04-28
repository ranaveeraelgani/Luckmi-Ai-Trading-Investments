'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase'  // Adjust path if your utility file is elsewhere
import luckmiAppLogo from '@/app/image/logo/luckmi_app_logo.png';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const router = useRouter();

  const supabase = createClient();

  useEffect(() => {
    const redirectIfLoggedIn = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        router.replace('/dashboard');
      }
    };

    redirectIfLoggedIn();
  }, [router, supabase]);

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
      }
      if (!signInError) {
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

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (signUpError) {
      setError(signUpError.message);
    } else {
      alert('Check your email for the confirmation link!');
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
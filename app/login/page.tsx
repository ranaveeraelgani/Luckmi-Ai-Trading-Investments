'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase'  // Adjust path if your utility file is elsewhere

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0c11] px-4">
      <div className="w-full max-w-md bg-[#11151c] border border-gray-700 rounded-3xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">AI Trading Platform</h1>
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
            <label className="block text-sm text-gray-400 mb-2">Password</label>
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
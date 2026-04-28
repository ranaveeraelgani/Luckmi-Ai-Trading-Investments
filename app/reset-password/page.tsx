'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('Open this page from your password reset email link.');
  const [isRecoveryReady, setIsRecoveryReady] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        setIsRecoveryReady(true);
        setInfo('Set your new password below.');
      }
    };

    checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setIsRecoveryReady(true);
        setInfo('Set your new password below.');
      }
    });

    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isRecoveryReady) {
      setError('Recovery session not found. Open the link from your email again.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    setInfo('Password updated successfully. Redirecting to login...');
    setLoading(false);

    setTimeout(() => {
      router.replace('/login');
    }, 1200);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0c11] px-4">
      <div className="w-full max-w-md bg-[#11151c] border border-gray-700 rounded-3xl p-8">
        <h1 className="text-2xl font-semibold text-white">Reset Password</h1>
        <p className="mt-2 text-sm text-gray-400">{info}</p>

        <form onSubmit={handleResetPassword} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white focus:outline-none focus:border-blue-500"
              placeholder="Re-enter your password"
            />
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 rounded-2xl font-medium text-white transition-colors"
          >
            {loading ? 'Updating password...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}

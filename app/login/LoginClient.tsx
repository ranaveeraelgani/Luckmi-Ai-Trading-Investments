'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase';
import luckmiAppLogo from '@/app/image/logo/luckmi_app_logo.png';

type View = 'signin' | 'signup';

const inputCls =
  'w-full px-4 py-3 bg-[#1a1f2e] border border-gray-700 rounded-2xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';

export default function LoginClient() {
  const [view, setView] = useState<View>('signin');

  // sign-in fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // sign-up fields (email/password re-used from above)
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const router = useRouter();

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const hash = window.location.hash || '';
    const query = window.location.search || '';
    const isRecoveryFlow =
      hash.includes('type=recovery') ||
      query.includes('type=recovery') ||
      query.includes('code=');

    if (isRecoveryFlow) {
      router.replace(`/reset-password${query}${hash}`);
    }
  }, [router]);

  function switchView(next: View) {
    setError('');
    setInfo('');
    setView(next);
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

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
      setError('First name and last name are required.');
      return;
    }

    const fullName = `${normalizedFirstName} ${normalizedLastName}`.trim();

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: signUpEmail,
      password: signUpPassword,
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
      if (signUpData?.user?.id) {
        try {
          await fetch('/api/subscription/init', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: signUpData.user.id }),
          });
        } catch {
          // Non-fatal
        }
      }
      setInfo('Account created! Check your email for a confirmation link.');
    }

    setLoading(false);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email above to receive a reset link.');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setInfo('Password reset link sent. Check your email.');
    }

    setLoading(false);
  };

  const Logo = () => (
    <div className="text-center mb-7">
      <div className="flex justify-center mb-3">
        <Image
          src={luckmiAppLogo}
          alt="Luckmi app logo"
          width={144}
          height={144}
          className="h-24 w-auto"
          priority
        />
      </div>
      <h1 className="text-3xl font-bold text-white">Luckmi AI</h1>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0c11] px-4">
      <div className="w-full max-w-md bg-[#11151c] border border-gray-700 rounded-3xl p-8">

        {/* ── SIGN IN ─────────────────────────────────────────── */}
        {view === 'signin' && (
          <>
            <Logo />
            <p className="text-gray-400 text-sm text-center -mt-4 mb-7">
              Sign in to your account
            </p>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputCls}
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
                    className="text-xs text-blue-400 hover:text-blue-300 transition disabled:opacity-50"
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className={inputCls}
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
                {loading ? 'Signing in…' : 'Sign In'}
              </button>
            </form>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => switchView('signup')}
                disabled={loading}
                className="w-full py-3.5 bg-gray-800 hover:bg-gray-700 rounded-2xl font-medium text-white transition-colors"
              >
                Create Account
              </button>
            </div>

            <p className="text-center text-xs text-gray-500 mt-8">
              This is a private trading platform. Contact admin for access.
            </p>
          </>
        )}

        {/* ── CREATE ACCOUNT ──────────────────────────────────── */}
        {view === 'signup' && (
          <>
            <Logo />
            <p className="text-gray-400 text-sm text-center -mt-4 mb-7">
              Create your account
            </p>

            <form onSubmit={handleSignUp} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    autoComplete="given-name"
                    className={inputCls}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    autoComplete="family-name"
                    className={inputCls}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">
                  Phone <span className="text-gray-600">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  className={inputCls}
                  placeholder="+1 555 123 4567"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Email</label>
                <input
                  type="email"
                  value={signUpEmail}
                  onChange={(e) => setSignUpEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputCls}
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Password</label>
                <input
                  type="password"
                  value={signUpPassword}
                  onChange={(e) => setSignUpPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={inputCls}
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
                {loading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>

            <div className="mt-5">
              <button
                type="button"
                onClick={() => switchView('signin')}
                disabled={loading}
                className="w-full py-3.5 bg-gray-800 hover:bg-gray-700 rounded-2xl font-medium text-white transition-colors"
              >
                Back to Sign In
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

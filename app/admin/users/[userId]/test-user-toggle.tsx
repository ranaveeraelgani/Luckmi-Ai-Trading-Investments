'use client';

import { useState } from 'react';

export function TestUserToggle({
  userId,
  initialValue,
}: {
  userId: string;
  initialValue: boolean;
}) {
  const [isTestUser, setIsTestUser] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/subscription/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: userId, isTestUser: !isTestUser }),
      });
      if (!res.ok) throw new Error('Failed to update test user flag');
      setIsTestUser((v) => !v);
    } catch (e: any) {
      setError(e.message || 'Error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span className={`text-sm font-medium ${isTestUser ? 'text-violet-300' : 'text-gray-400'}`}>
        {isTestUser ? 'Test User (unlimited access)' : 'Regular User'}
      </span>
      <button
        onClick={toggle}
        disabled={loading}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-[#1a1f2e] disabled:opacity-50 ${
          isTestUser ? 'bg-violet-600' : 'bg-gray-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isTestUser ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      {error ? <span className="text-xs text-red-400">{error}</span> : null}
    </div>
  );
}

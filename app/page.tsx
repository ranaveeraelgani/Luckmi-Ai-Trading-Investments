'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash || '';
    const query = window.location.search || '';

    const isRecoveryFlow =
      hash.includes('type=recovery') ||
      query.includes('type=recovery') ||
      query.includes('code=');

    if (isRecoveryFlow) {
      const suffix = `${query}${hash}`;
      router.replace(`/reset-password${suffix}`);
      return;
    }

    router.replace('/login');
  }, [router]);

  return <div>Redirecting to login...</div>;
}
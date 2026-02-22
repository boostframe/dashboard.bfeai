'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BillingPortalPage() {
  const router = useRouter();

  useEffect(() => {
    async function redirect() {
      try {
        const res = await fetch('/.netlify/functions/stripe-portal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ returnUrl: window.location.origin + '/' }),
        });
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        } else {
          router.push('/billing');
        }
      } catch {
        router.push('/billing');
      }
    }
    redirect();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-[200px] gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-indigo" />
      <span className="text-muted-foreground">Redirecting to Stripe...</span>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AppConfig } from "@/config/apps";

interface TryPageProps {
  app: AppConfig;
}

export default function TryPage({ app }: TryPageProps) {
  const searchParams = useSearchParams();
  const checkoutStatus = searchParams.get("checkout");

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStartTrial() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/.netlify/functions/stripe-checkout-public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appKey: app.key,
          ...(email ? { email } : {}),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Success state
  if (checkoutStatus === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">You&apos;re all set!</h1>
          <p className="text-gray-600 mb-6">
            Check your email to set your password. Once you&apos;ve set it, you can log in and start using {app.name}.
          </p>
          <a
            href="/login"
            className="inline-block px-6 py-3 bg-[#533577] text-white font-semibold rounded-lg hover:bg-[#442966] transition-colors"
          >
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  // Cancelled state
  if (checkoutStatus === "cancelled") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">No problem!</h1>
          <p className="text-gray-600 mb-6">
            You can come back anytime to start your trial.
          </p>
          <button
            onClick={() => {
              window.history.replaceState(null, "", window.location.pathname);
              window.location.reload();
            }}
            className="inline-block px-6 py-3 bg-[#533577] text-white font-semibold rounded-lg hover:bg-[#442966] transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Default: landing page
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className={`bg-gradient-to-r ${app.gradient} p-8 text-white`}>
            <h1 className="text-3xl font-bold mb-2">Try {app.name}</h1>
            <p className="text-white/90 text-lg">{app.description}</p>
          </div>

          {/* Body */}
          <div className="p-8">
            {/* Pricing */}
            <div className="bg-gray-50 rounded-xl p-6 mb-6 text-center">
              <p className="text-3xl font-bold text-gray-900">
                $1 <span className="text-base font-normal text-gray-500">today</span>
              </p>
              <p className="text-gray-600 mt-1">
                then ${app.pricing?.monthly ?? 29}/month after 7 days. Cancel anytime.
              </p>
            </div>

            {/* Features */}
            <ul className="space-y-3 mb-8">
              {app.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-green-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>

            {/* Email input (optional) */}
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email (optional — pre-fills checkout)
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#533577] focus:border-transparent outline-none transition-shadow"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleStartTrial}
              disabled={loading}
              className="w-full py-4 bg-[#533577] text-white font-semibold text-lg rounded-lg hover:bg-[#442966] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Redirecting to checkout..." : "Start My 7-Day Trial"}
            </button>

            {/* Sign in link */}
            <p className="text-center text-sm text-gray-500 mt-4">
              Already have an account?{" "}
              <a href="/login" className="text-[#533577] font-medium hover:underline">
                Sign in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

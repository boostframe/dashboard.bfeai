/**
 * Plan and top-up pack configuration for the Stripe + Credits billing model.
 *
 * Currently only Keywords ($29/mo, 300 credits) is available.
 * Top-up packs are one-time purchases for additional credits.
 */

import { getStripeEnv } from "../lib/stripe-env";

export type TopUpPackKey = "starter" | "builder" | "power" | "pro" | "max";

export type TopUpPack = {
  key: TopUpPackKey;
  name: string;
  credits: number;
  price: number;
  perCredit: string;
  approxRuns: number;
};

export const TOPUP_PACKS: Record<TopUpPackKey, TopUpPack> = {
  starter: { key: "starter", name: "Starter Boost", credits: 75, price: 9, perCredit: "$0.120", approxRuns: 3 },
  builder: { key: "builder", name: "Builder Pack", credits: 270, price: 29, perCredit: "$0.107", approxRuns: 13 },
  power: { key: "power", name: "Power Pack", credits: 980, price: 99, perCredit: "$0.101", approxRuns: 49 },
  pro: { key: "pro", name: "Pro Pack", credits: 2500, price: 249, perCredit: "$0.100", approxRuns: 125 },
  max: { key: "max", name: "Max Pack", credits: 5250, price: 499, perCredit: "$0.095", approxRuns: 262 },
};

export const TOPUP_PACK_ORDER: TopUpPackKey[] = ["starter", "builder", "power", "pro", "max"];

/** The pack with the best value for the "Best Value" badge */
export const BEST_VALUE_PACK: TopUpPackKey = "power";

/** Keywords subscription: $29/mo, 300 credits, caps at 900 */
export const KEYWORDS_SUBSCRIPTION = {
  appKey: "keywords",
  tier: "standard",
  monthlyPrice: 29,
  monthlyCredits: 300,
  creditCap: 900,
  stripePriceIdMonthly: getStripeEnv("STRIPE_PRICE_KEYWORDS_MONTHLY"),
  stripePriceIdYearly: getStripeEnv("STRIPE_PRICE_KEYWORDS_YEARLY"),
} as const;

/** LABS Base: $29/mo, 300 credits, caps at 900 */
export const LABS_BASE_SUBSCRIPTION = {
  appKey: "labs",
  tier: "base_tracker",
  monthlyPrice: 29,
  monthlyCredits: 300,
  creditCap: 900,
  stripePriceIdMonthly: getStripeEnv("STRIPE_PRICE_LABS_BASE_MONTHLY"),
  stripePriceIdYearly: getStripeEnv("STRIPE_PRICE_LABS_BASE_YEARLY"),
} as const;

/** LABS AEO Consultant: $79/mo, 900 credits, caps at 2700 */
export const LABS_AEO_SUBSCRIPTION = {
  appKey: "labs",
  tier: "aeo_consultant",
  monthlyPrice: 79,
  monthlyCredits: 900,
  creditCap: 2700,
  stripePriceIdMonthly: getStripeEnv("STRIPE_PRICE_LABS_AEO_MONTHLY"),
  stripePriceIdYearly: getStripeEnv("STRIPE_PRICE_LABS_AEO_YEARLY"),
} as const;

/** All subscription plans for lookup */
export const ALL_SUBSCRIPTIONS = [
  KEYWORDS_SUBSCRIPTION,
  LABS_BASE_SUBSCRIPTION,
  LABS_AEO_SUBSCRIPTION,
] as const;

/** Find a subscription plan by appKey and optional tier */
export function findSubscriptionPlan(appKey: string, tier?: string) {
  return ALL_SUBSCRIPTIONS.find(
    (p) => p.appKey === appKey && (!tier || p.tier === tier)
  );
}

/** Find a subscription plan by its Stripe Price ID */
export function findSubscriptionByPriceId(priceId: string) {
  return ALL_SUBSCRIPTIONS.find(
    (p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
  );
}

/** Get monthly credits for a given appKey + priceId combination */
export function getMonthlyCreditsForSubscription(appKey: string, priceId?: string): number {
  // Try price ID match first (most specific)
  if (priceId) {
    const plan = findSubscriptionByPriceId(priceId);
    if (plan) return plan.monthlyCredits;
  }
  // Fall back to first plan matching appKey
  const plan = ALL_SUBSCRIPTIONS.find((p) => p.appKey === appKey);
  return plan?.monthlyCredits ?? 300; // Default to 300 for safety
}

/** Bundle discount coupon ID — $9/mo off when user subscribes to 2+ apps */
export const BUNDLE_DISCOUNT_COUPON_ID = getStripeEnv("STRIPE_COUPON_BUNDLE_DISCOUNT");

/** Dual trial $2 setup fee one-time price ID */
export const DUAL_TRIAL_SETUP_FEE_PRICE_ID = getStripeEnv("STRIPE_PRICE_DUAL_TRIAL_SETUP_FEE");

/** Trial credits allocated on dual trial start */
export const TRIAL_CREDITS = 100;

/** Get trial credits for a given app (100 for dual trial) */
export function getTrialCreditsForApp(_appKey: string): number {
  return TRIAL_CREDITS;
}

/** App keys included in the dual trial */
export function getDualTrialAppKeys(): string[] {
  return ["keywords", "labs"];
}

/** App keys + tiers for dual trial subscription creation */
export function getDualTrialTiers(): { appKey: string; tier: string }[] {
  return [
    { appKey: "keywords", tier: "standard" },
    { appKey: "labs", tier: "base_tracker" },
  ];
}

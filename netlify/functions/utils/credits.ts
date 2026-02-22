import { HttpError } from "./http";
import { supabaseAdmin } from "./supabase-admin";
import { findSubscriptionByPriceId, findSubscriptionPlan } from "../../../config/plans";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CreditBalance = {
  subscriptionBalance: number;
  topupBalance: number;
  trialBalance: number;
  total: number;
  cap: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
};

export type CreditCheckResult = {
  sufficient: boolean;
  cost: number;
  balance: number;
};

export type DeductResult = {
  newBalance: number;
  transactionId: string;
};

export type AllocateResult = {
  newBalance: number;
  allocated: number;
};

export type CreditTransaction = {
  id: string;
  amount: number;
  balance_after: number;
  pool: "subscription" | "topup" | "trial";
  type: string;
  description: string | null;
  app_key: string | null;
  reference_id: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Balance
// ---------------------------------------------------------------------------

/**
 * Get the current credit balance for a user (both pools).
 */
export const getBalance = async (userId: string): Promise<CreditBalance> => {
  const { data, error } = await supabaseAdmin
    .from("user_credits")
    .select("subscription_balance, topup_balance, trial_balance, trial_expires_at, subscription_cap, lifetime_earned, lifetime_spent")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to fetch credit balance", error.message);
  }

  if (!data) {
    return { subscriptionBalance: 0, topupBalance: 0, trialBalance: 0, total: 0, cap: 900, lifetimeEarned: 0, lifetimeSpent: 0 };
  }

  // Check if trial credits have expired
  const now = new Date();
  const trialExpiresAt = data.trial_expires_at ? new Date(data.trial_expires_at) : null;
  const trialBalance = trialExpiresAt && trialExpiresAt < now ? 0 : (data.trial_balance ?? 0);

  return {
    subscriptionBalance: data.subscription_balance,
    topupBalance: data.topup_balance,
    trialBalance,
    total: data.subscription_balance + data.topup_balance + trialBalance,
    cap: data.subscription_cap,
    lifetimeEarned: data.lifetime_earned,
    lifetimeSpent: data.lifetime_spent,
  };
};

// ---------------------------------------------------------------------------
// Credit check
// ---------------------------------------------------------------------------

/**
 * Check if a user has enough credits for an operation.
 */
export const checkCredits = async (
  userId: string,
  appKey: string,
  operation: string
): Promise<CreditCheckResult> => {
  const [balance, cost] = await Promise.all([
    getBalance(userId),
    getCreditCost(appKey, operation),
  ]);

  return {
    sufficient: balance.total >= cost,
    cost,
    balance: balance.total,
  };
};

// ---------------------------------------------------------------------------
// Deductions (spend order: trial first, then topup, then subscription)
// ---------------------------------------------------------------------------

/**
 * Deduct credits for an operation. Drains trial_balance first, then topup, then subscription.
 * Returns the new total balance and transaction ID.
 */
export const deductCredits = async (
  userId: string,
  appKey: string,
  operation: string,
  referenceId?: string
): Promise<DeductResult> => {
  const cost = await getCreditCost(appKey, operation);
  const balance = await getBalance(userId);

  if (balance.total < cost) {
    throw new HttpError(402, "Insufficient credits", {
      required: cost,
      available: balance.total,
    });
  }

  const now = new Date().toISOString();
  let lastTransactionId = "";

  // Calculate split: trial drains first, then topup, then subscription
  const deductFromTrial = Math.min(cost, balance.trialBalance);
  const remainingAfterTrial = cost - deductFromTrial;
  const deductFromTopup = Math.min(remainingAfterTrial, balance.topupBalance);
  const deductFromSub = remainingAfterTrial - deductFromTopup;

  const newTrial = balance.trialBalance - deductFromTrial;
  const newTopup = balance.topupBalance - deductFromTopup;
  const newSub = balance.subscriptionBalance - deductFromSub;
  const newBalance = balance.total - cost;

  // Update all three pools and lifetime_spent in a single write
  await supabaseAdmin
    .from("user_credits")
    .update({
      trial_balance: newTrial,
      topup_balance: newTopup,
      subscription_balance: newSub,
      lifetime_spent: balance.lifetimeSpent + cost,
      updated_at: now,
    })
    .eq("user_id", userId);

  // Log transaction(s)
  if (deductFromTrial > 0) {
    const { data: txn } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: -deductFromTrial,
        balance_after: balance.total - deductFromTrial,
        pool: "trial",
        type: "usage_deduction",
        description: `${operation} (${appKey})`,
        app_key: appKey,
        reference_id: referenceId ?? null,
      })
      .select("id")
      .single();

    lastTransactionId = txn?.id ?? "";
  }

  if (deductFromTopup > 0) {
    const { data: txn } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: -deductFromTopup,
        balance_after: balance.total - deductFromTrial - deductFromTopup,
        pool: "topup",
        type: "usage_deduction",
        description: `${operation} (${appKey})`,
        app_key: appKey,
        reference_id: referenceId ?? null,
      })
      .select("id")
      .single();

    lastTransactionId = txn?.id ?? "";
  }

  if (deductFromSub > 0) {
    const { data: txn } = await supabaseAdmin
      .from("credit_transactions")
      .insert({
        user_id: userId,
        amount: -deductFromSub,
        balance_after: newBalance,
        pool: "subscription",
        type: "usage_deduction",
        description: `${operation} (${appKey})`,
        app_key: appKey,
        reference_id: referenceId ?? null,
      })
      .select("id")
      .single();

    lastTransactionId = txn?.id ?? "";
  }

  return { newBalance, transactionId: lastTransactionId };
};

// ---------------------------------------------------------------------------
// Allocations
// ---------------------------------------------------------------------------

/**
 * Ensure the user_credits row exists for a user. Creates one if missing.
 */
const ensureUserCreditsRow = async (userId: string): Promise<void> => {
  const { data } = await supabaseAdmin
    .from("user_credits")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) {
    await supabaseAdmin.from("user_credits").insert({ user_id: userId });
  }
};

/**
 * Allocate monthly subscription credits. Respects the 3x cap.
 * Returns the amount actually allocated (may be less than requested if near cap).
 */
export const allocateSubscriptionCredits = async (
  userId: string,
  amount: number,
  appKey: string,
  referenceId?: string
): Promise<AllocateResult> => {
  await ensureUserCreditsRow(userId);
  const balance = await getBalance(userId);

  // Calculate how much we can allocate without exceeding the cap
  const headroom = Math.max(0, balance.cap - balance.subscriptionBalance);
  const allocated = Math.min(amount, headroom);

  if (allocated === 0) {
    // At cap, skip allocation but still log it
    return { newBalance: balance.total, allocated: 0 };
  }

  const newSubBalance = balance.subscriptionBalance + allocated;
  const newTotal = balance.total + allocated;
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("user_credits")
    .update({
      subscription_balance: newSubBalance,
      lifetime_earned: balance.lifetimeEarned + allocated,
      last_allocated: now,
      updated_at: now,
    })
    .eq("user_id", userId);

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount: allocated,
    balance_after: newTotal,
    pool: "subscription",
    type: "subscription_allocation",
    description: `Monthly allocation (${appKey})`,
    app_key: appKey,
    reference_id: referenceId ?? null,
  });

  return { newBalance: newTotal, allocated };
};

/**
 * Allocate top-up credits from a purchased pack. No cap.
 */
export const allocateTopUpCredits = async (
  userId: string,
  amount: number,
  packName: string,
  referenceId?: string
): Promise<AllocateResult> => {
  await ensureUserCreditsRow(userId);
  const balance = await getBalance(userId);

  const newTopup = balance.topupBalance + amount;
  const newTotal = balance.total + amount;
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("user_credits")
    .update({
      topup_balance: newTopup,
      lifetime_earned: balance.lifetimeEarned + amount,
      updated_at: now,
    })
    .eq("user_id", userId);

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    balance_after: newTotal,
    pool: "topup",
    type: "topup_purchase",
    description: `${packName} top-up`,
    app_key: null,
    reference_id: referenceId ?? null,
  });

  return { newBalance: newTotal, allocated: amount };
};

/**
 * Allocate bonus credits from a retention offer. Added to topup pool (uncapped).
 */
export const allocateRetentionBonus = async (
  userId: string,
  amount: number
): Promise<AllocateResult> => {
  await ensureUserCreditsRow(userId);
  const balance = await getBalance(userId);

  const newTopup = balance.topupBalance + amount;
  const newTotal = balance.total + amount;
  const now = new Date().toISOString();

  await supabaseAdmin
    .from("user_credits")
    .update({
      topup_balance: newTopup,
      lifetime_earned: balance.lifetimeEarned + amount,
      updated_at: now,
    })
    .eq("user_id", userId);

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    balance_after: newTotal,
    pool: "topup",
    type: "retention_bonus",
    description: "Retention offer bonus credits",
    app_key: null,
    reference_id: null,
  });

  return { newBalance: newTotal, allocated: amount };
};

// ---------------------------------------------------------------------------
// Trial credit operations
// ---------------------------------------------------------------------------

/**
 * Allocate trial credits to trial_balance and set trial_expires_at.
 * Trial credits are use-it-or-lose-it and expire after the trial period.
 */
export const allocateTrialCredits = async (
  userId: string,
  amount: number,
  appKey: string,
  trialEndsAt: Date,
  referenceId?: string
): Promise<AllocateResult> => {
  await ensureUserCreditsRow(userId);
  const balance = await getBalance(userId);

  const now = new Date().toISOString();

  await supabaseAdmin
    .from("user_credits")
    .update({
      trial_balance: amount,
      trial_expires_at: trialEndsAt.toISOString(),
      lifetime_earned: balance.lifetimeEarned + amount,
      updated_at: now,
    })
    .eq("user_id", userId);

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount,
    balance_after: balance.total + amount,
    pool: "trial",
    type: "trial_allocation",
    description: `Trial credits (${appKey})`,
    app_key: appKey,
    reference_id: referenceId ?? null,
  });

  return { newBalance: balance.total + amount, allocated: amount };
};

/**
 * Expire trial credits: zero out trial_balance and clear trial_expires_at.
 * Logs the expiry as a negative transaction for audit trail.
 */
export const expireTrialCredits = async (
  userId: string,
  appKey: string,
  reason: string
): Promise<void> => {
  const { data } = await supabaseAdmin
    .from("user_credits")
    .select("trial_balance")
    .eq("user_id", userId)
    .maybeSingle();

  const trialBalance = data?.trial_balance ?? 0;
  if (trialBalance === 0) return; // Nothing to expire

  const now = new Date().toISOString();

  await supabaseAdmin
    .from("user_credits")
    .update({
      trial_balance: 0,
      trial_expires_at: null,
      updated_at: now,
    })
    .eq("user_id", userId);

  // Get current total for balance_after calculation
  const balance = await getBalance(userId);

  await supabaseAdmin.from("credit_transactions").insert({
    user_id: userId,
    amount: -trialBalance,
    balance_after: balance.total,
    pool: "trial",
    type: "trial_expiry",
    description: `Trial credits expired: ${reason}`,
    app_key: appKey,
    reference_id: null,
  });
};

/**
 * Merge remaining trial credits into subscription_balance on trial-to-paid conversion.
 * Respects the subscription cap. Clears trial_balance and trial_expires_at.
 * Any credits exceeding the cap are lost and logged as trial_merge_overflow.
 */
export const mergeTrialCredits = async (
  userId: string,
  appKey: string
): Promise<{ merged: number }> => {
  const { data } = await supabaseAdmin
    .from("user_credits")
    .select("trial_balance, subscription_balance, subscription_cap")
    .eq("user_id", userId)
    .maybeSingle();

  const trialBalance = data?.trial_balance ?? 0;
  if (trialBalance === 0) return { merged: 0 };

  const subBalance = data?.subscription_balance ?? 0;
  const cap = data?.subscription_cap ?? 900;
  const headroom = Math.max(0, cap - subBalance);
  const merged = Math.min(trialBalance, headroom);

  const now = new Date().toISOString();

  await supabaseAdmin
    .from("user_credits")
    .update({
      trial_balance: 0,
      trial_expires_at: null,
      subscription_balance: subBalance + merged,
      updated_at: now,
    })
    .eq("user_id", userId);

  if (merged > 0) {
    // Log the merge as a subscription credit transaction
    const balance = await getBalance(userId);

    await supabaseAdmin.from("credit_transactions").insert({
      user_id: userId,
      amount: merged,
      balance_after: balance.total,
      pool: "subscription",
      type: "trial_merge",
      description: `Trial credits merged on conversion (${appKey})`,
      app_key: appKey,
      reference_id: null,
    });
  }

  // If any trial credits exceeded cap, they're lost (logged as overflow)
  const lost = trialBalance - merged;
  if (lost > 0) {
    const balance = await getBalance(userId);
    await supabaseAdmin.from("credit_transactions").insert({
      user_id: userId,
      amount: -lost,
      balance_after: balance.total,
      pool: "trial",
      type: "trial_merge_overflow",
      description: `Trial credits lost on merge (cap reached) (${appKey})`,
      app_key: appKey,
      reference_id: null,
    });
  }

  return { merged };
};

// ---------------------------------------------------------------------------
// Usage history
// ---------------------------------------------------------------------------

/**
 * Get credit transaction history for a user.
 */
export const getUsageHistory = async (
  userId: string,
  limit = 50,
  offset = 0
): Promise<{ transactions: CreditTransaction[]; total: number }> => {
  const { data, error, count } = await supabaseAdmin
    .from("credit_transactions")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    throw new HttpError(500, "Failed to fetch credit history", error.message);
  }

  return {
    transactions: (data ?? []) as CreditTransaction[],
    total: count ?? 0,
  };
};

// ---------------------------------------------------------------------------
// Credit cost lookup
// ---------------------------------------------------------------------------

/**
 * Get the credit cost for an operation in an app.
 */
export const getCreditCost = async (
  appKey: string,
  operation: string
): Promise<number> => {
  const { data, error } = await supabaseAdmin
    .from("app_credit_config")
    .select("credit_cost")
    .eq("app_key", appKey)
    .eq("operation", operation)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to fetch credit cost", error.message);
  }

  if (!data) {
    throw new HttpError(404, `Unknown operation: ${appKey}/${operation}`);
  }

  return data.credit_cost;
};

// ---------------------------------------------------------------------------
// Dynamic cap recalculation
// ---------------------------------------------------------------------------

/**
 * Recalculate a user's subscription_cap based on all active app subscriptions.
 * Cap = sum of creditCap for each active subscription (from plans.ts).
 * Called whenever subscription state changes (create, update, delete, pause, resume).
 */
export const recalculateSubscriptionCap = async (
  userId: string
): Promise<number> => {
  const { data: subs, error } = await supabaseAdmin
    .from("app_subscriptions")
    .select("app_key, stripe_price_id, status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"]);

  if (error) {
    console.error("[credits] Failed to fetch subscriptions for cap recalc:", error.message);
    return 900; // Default, don't throw — cap recalc is non-critical
  }

  let totalCap = 0;

  if (!subs || subs.length === 0) {
    totalCap = 900; // Default cap for users with no active subs
  } else {
    for (const sub of subs) {
      // Try price ID lookup first (handles multi-tier apps like LABS)
      const plan = sub.stripe_price_id
        ? findSubscriptionByPriceId(sub.stripe_price_id)
        : null;

      if (plan) {
        totalCap += plan.creditCap;
      } else {
        // Fallback to first plan matching app_key
        const fallback = findSubscriptionPlan(sub.app_key);
        totalCap += fallback?.creditCap ?? 900;
      }
    }
  }

  await supabaseAdmin
    .from("user_credits")
    .update({ subscription_cap: totalCap, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  return totalCap;
};

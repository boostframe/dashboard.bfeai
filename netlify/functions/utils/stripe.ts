import Stripe from "stripe";
import { HttpError } from "./http";
import { supabaseAdmin } from "./supabase-admin";
import {
  findSubscriptionByPriceId,
  findSubscriptionPlan,
  BUNDLE_DISCOUNT_COUPON_ID,
  DUAL_TRIAL_SETUP_FEE_PRICE_ID,
  getDualTrialAppKeys,
  getDualTrialTiers,
  getTrialCreditsForApp,
} from "../../../config/plans";
import { getStripeEnv } from "../../../lib/stripe-env";

const stripeSecretKey = getStripeEnv("STRIPE_SECRET_KEY");

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY env var is not configured");
}

export const stripe = new Stripe(stripeSecretKey);

const TRIAL_SETUP_FEE_PRICE_ID = getStripeEnv("STRIPE_PRICE_TRIAL_SETUP_FEE");
import { allocateTrialCredits } from "./credits";

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

/**
 * Get or create a Stripe customer for a BFEAI user.
 * Stores stripe_customer_id on the profiles table.
 */
export const getOrCreateStripeCustomer = async (
  userId: string,
  email: string,
  name?: string
): Promise<string> => {
  // Check if we already have a mapping
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  // Check if a Stripe customer already exists for this email
  const existing = await stripe.customers.list({ email, limit: 1 });
  let customerId: string;

  if (existing.data.length > 0) {
    customerId = existing.data[0].id;
  } else {
    const customer = await stripe.customers.create({
      email,
      name: name ?? undefined,
      metadata: { bfeai_user_id: userId },
    });
    customerId = customer.id;
  }

  // Persist mapping
  await supabaseAdmin
    .from("profiles")
    .update({ stripe_customer_id: customerId, updated_at: new Date().toISOString() })
    .eq("id", userId);

  return customerId;
};

// ---------------------------------------------------------------------------
// Checkout sessions
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Checkout session for a Keywords app subscription.
 */
export const createCheckoutSession = async (
  customerId: string,
  priceId: string,
  appKey: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> => {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { type: "subscription", app_key: appKey },
    subscription_data: {
      metadata: { app_key: appKey },
    },
  });
};

/**
 * Create a Stripe Checkout session for a one-time credit top-up purchase.
 */
export const createTopUpCheckoutSession = async (
  customerId: string,
  priceId: string,
  credits: number,
  packName: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> => {
  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      type: "topup",
      credits: String(credits),
      pack_name: packName,
    },
  });
};

/**
 * Check if a user is eligible for a trial subscription.
 * Returns { eligible: false } if user has ANY prior subscription for this app.
 */
export const checkTrialEligibility = async (
  userId: string,
  appKey: string,
  customerId: string
): Promise<{ eligible: boolean; reason?: string }> => {
  // Check 1: Any existing app_subscriptions row for this user+app
  const { data: existingSub } = await supabaseAdmin
    .from("app_subscriptions")
    .select("id, status")
    .eq("user_id", userId)
    .eq("app_key", appKey)
    .maybeSingle();

  if (existingSub) {
    return {
      eligible: false,
      reason: `User already has ${existingSub.status} subscription for ${appKey}`,
    };
  }

  // Check 2: Stripe-level check (catches edge cases where DB is out of sync)
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 100,
  });

  const hasAppSub = subscriptions.data.some(
    (sub) => sub.metadata?.app_key === appKey
  );

  if (hasAppSub) {
    return {
      eligible: false,
      reason: `Stripe shows existing subscription for ${appKey}`,
    };
  }

  return { eligible: true };
};

/**
 * Create a Stripe Checkout session for a trial subscription.
 * Includes $1 setup fee as one-time line item + 7-day trial on recurring price.
 */
export const createTrialCheckoutSession = async (
  customerId: string,
  recurringPriceId: string,
  appKey: string,
  successUrl: string,
  cancelUrl: string
): Promise<Stripe.Checkout.Session> => {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: recurringPriceId, quantity: 1 },
  ];

  // Add $1 setup fee as one-time line item if configured
  if (TRIAL_SETUP_FEE_PRICE_ID) {
    lineItems.push({ price: TRIAL_SETUP_FEE_PRICE_ID, quantity: 1 });
  }

  return stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { type: "trial", app_key: appKey },
    subscription_data: {
      trial_period_days: 7,
      metadata: { app_key: appKey },
    },
  });
};

/**
 * Create a Stripe Checkout session for an unauthenticated trial.
 * Accepts either an existing customerId OR a customer_email for new users.
 * Adds metadata.flow: "unauthenticated" so the webhook knows to auto-provision.
 */
export const createPublicTrialCheckoutSession = async (
  opts: {
    customerId?: string;
    customerEmail?: string;
    recurringPriceId: string;
    appKey: string;
    successUrl: string;
    cancelUrl: string;
  }
): Promise<Stripe.Checkout.Session> => {
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: opts.recurringPriceId, quantity: 1 },
  ];

  if (TRIAL_SETUP_FEE_PRICE_ID) {
    lineItems.push({ price: TRIAL_SETUP_FEE_PRICE_ID, quantity: 1 });
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: lineItems,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: { type: "trial", app_key: opts.appKey, flow: "unauthenticated" },
    subscription_data: {
      trial_period_days: 7,
      metadata: { app_key: opts.appKey },
    },
  };

  if (opts.customerId) {
    sessionParams.customer = opts.customerId;
  } else if (opts.customerEmail) {
    sessionParams.customer_email = opts.customerEmail;
  }

  return stripe.checkout.sessions.create(sessionParams);
};

// ---------------------------------------------------------------------------
// Portal session
// ---------------------------------------------------------------------------

/**
 * Create a Stripe Customer Portal session for managing payment methods / invoices.
 */
export const createPortalSession = async (
  customerId: string,
  returnUrl: string
): Promise<Stripe.BillingPortal.Session> => {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
};

// ---------------------------------------------------------------------------
// Subscription queries
// ---------------------------------------------------------------------------

/**
 * Get ALL active subscriptions for a customer (across all apps).
 */
export const getActiveSubscriptions = async (
  customerId: string
): Promise<Stripe.Subscription[]> => {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    limit: 20,
    expand: ["data.default_payment_method", "data.latest_invoice"],
  });

  const activeStatuses = new Set(["active", "trialing", "past_due", "paused"]);
  return subscriptions.data.filter((s) => activeStatuses.has(s.status));
};

// ---------------------------------------------------------------------------
// Subscription management
// ---------------------------------------------------------------------------

/**
 * Cancel a subscription at period end.
 */
export const cancelSubscription = async (
  subscriptionId: string
): Promise<Stripe.Subscription> => {
  return stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });
};

/**
 * Apply a coupon/discount to a subscription.
 * Stripe v20 uses `discounts` array instead of `coupon`.
 */
export const applyDiscount = async (
  subscriptionId: string,
  couponId: string
): Promise<Stripe.Subscription> => {
  return stripe.subscriptions.update(subscriptionId, {
    discounts: [{ coupon: couponId }],
  });
};

/**
 * Pause a subscription for 1 billing cycle.
 * Uses Stripe's pause_collection to stop invoicing while keeping the sub active.
 */
export const pauseSubscription = async (
  subscriptionId: string
): Promise<Stripe.Subscription> => {
  // Resume ~1 month from now
  const resumeAt = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60;

  return stripe.subscriptions.update(subscriptionId, {
    pause_collection: {
      behavior: "void",
      resumes_at: resumeAt,
    },
  });
};

/**
 * Resume a paused subscription immediately.
 */
export const resumeSubscription = async (
  subscriptionId: string
): Promise<Stripe.Subscription> => {
  return stripe.subscriptions.update(subscriptionId, {
    pause_collection: "",
  } as Stripe.SubscriptionUpdateParams);
};

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/**
 * List invoices for a customer.
 */
export const getInvoices = async (
  customerId: string,
  limit = 20
): Promise<Stripe.Invoice[]> => {
  const result = await stripe.invoices.list({
    customer: customerId,
    limit,
    status: "paid",
  });
  return result.data;
};

// ---------------------------------------------------------------------------
// User tier management
// ---------------------------------------------------------------------------

/**
 * Update a user's tier in the profiles table.
 * Only upgrades — never overwrites 'founder' with a lower tier.
 */
export const updateUserTier = async (
  userId: string,
  tier: "founder" | "beta_tester" | "user"
): Promise<void> => {
  // Fetch current tier first to avoid downgrading founders
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("user_tier")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) return;

  // Never downgrade: founder > beta_tester > user
  const tierRank: Record<string, number> = { founder: 3, beta_tester: 2, user: 1 };
  if ((tierRank[profile.user_tier] ?? 0) >= tierRank[tier]) return;

  await supabaseAdmin
    .from("profiles")
    .update({ user_tier: tier, updated_at: new Date().toISOString() })
    .eq("id", userId);

  console.log(`[stripe] Updated user ${userId} tier: ${profile.user_tier} → ${tier}`);
};

// ---------------------------------------------------------------------------
// Webhook verification
// ---------------------------------------------------------------------------

/**
 * Verify and construct a Stripe webhook event.
 */
export const constructWebhookEvent = (
  body: string,
  signature: string
): Stripe.Event => {
  const webhookSecret = getStripeEnv("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    throw new HttpError(500, "STRIPE_WEBHOOK_SECRET is not configured");
  }
  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
};

// ---------------------------------------------------------------------------
// Idempotency: track processed webhook events
// ---------------------------------------------------------------------------

/**
 * Check if a Stripe event has already been processed. Returns true if already handled.
 */
export const isEventProcessed = async (eventId: string): Promise<boolean> => {
  const { data } = await supabaseAdmin
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  return !!data;
};

/**
 * Mark a Stripe event as processed.
 */
export const markEventProcessed = async (
  eventId: string,
  eventType: string,
  payload?: unknown
): Promise<void> => {
  await supabaseAdmin.from("stripe_events").insert({
    id: eventId,
    type: eventType,
    payload: payload ?? null,
  });
};

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

/**
 * Sync a Stripe subscription to the app_subscriptions table.
 * In Stripe v20, period timestamps come from the latest_invoice, not the subscription.
 */
export const syncAppSubscription = async (
  userId: string,
  subscription: Stripe.Subscription,
  appKey: string
): Promise<void> => {
  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const amountCents = subscription.items.data[0]?.price?.unit_amount ?? null;
  const isPaused = subscription.pause_collection !== null;
  const status = isPaused ? "paused" : subscription.status;

  // Get period dates from latest invoice if expanded, otherwise use start_date
  let periodStart: string | null = null;
  let periodEnd: string | null = null;

  if (subscription.latest_invoice && typeof subscription.latest_invoice === "object") {
    const invoice = subscription.latest_invoice as Stripe.Invoice;
    if (invoice.period_start) {
      periodStart = new Date(invoice.period_start * 1000).toISOString();
    }
    if (invoice.period_end) {
      periodEnd = new Date(invoice.period_end * 1000).toISOString();
    }
  }

  // Fallback: use subscription start_date for period_start
  if (!periodStart && subscription.start_date) {
    periodStart = new Date(subscription.start_date * 1000).toISOString();
  }

  const record = {
    user_id: userId,
    app_key: appKey,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    status,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at
      ? new Date(subscription.canceled_at * 1000).toISOString()
      : null,
    paused_at: isPaused ? new Date().toISOString() : null,
    resume_at: subscription.pause_collection?.resumes_at
      ? new Date(subscription.pause_collection.resumes_at * 1000).toISOString()
      : null,
    trial_end: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    monthly_credits: (() => {
      const plan = priceId ? findSubscriptionByPriceId(priceId) : null;
      return plan?.monthlyCredits ?? findSubscriptionPlan(appKey)?.monthlyCredits ?? 300;
    })(),
    amount_cents: amountCents,
    currency: subscription.currency ?? "usd",
    updated_at: new Date().toISOString(),
  };

  await supabaseAdmin
    .from("app_subscriptions")
    .upsert(record, { onConflict: "user_id,app_key" });
};

/**
 * Look up the BFEAI user_id from a Stripe customer ID.
 */
export const getUserIdFromStripeCustomer = async (
  customerId: string
): Promise<string | null> => {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
};

// ---------------------------------------------------------------------------
// Bundle discount logic
// ---------------------------------------------------------------------------

/**
 * Check if a user has subscriptions to 2+ distinct apps (bundle-eligible).
 * Returns distinct app keys that are active.
 */
export const getBundleEligibility = async (
  userId: string
): Promise<{ eligible: boolean; distinctApps: string[] }> => {
  const { data: subs } = await supabaseAdmin
    .from("app_subscriptions")
    .select("app_key, status")
    .eq("user_id", userId)
    .in("status", ["active", "trialing", "past_due"]);

  const distinctApps = [...new Set((subs ?? []).map((s) => s.app_key))];

  return {
    eligible: distinctApps.length >= 2,
    distinctApps,
  };
};

/**
 * Apply the bundle discount coupon to all active Stripe subscriptions for a customer.
 * Idempotent — skips subscriptions that already have the coupon.
 */
export const applyBundleDiscountIfEligible = async (
  customerId: string,
  userId: string
): Promise<void> => {
  if (!BUNDLE_DISCOUNT_COUPON_ID) {
    console.warn("[stripe] Bundle discount coupon not configured (STRIPE_COUPON_BUNDLE_DISCOUNT)");
    return;
  }

  const { eligible } = await getBundleEligibility(userId);
  if (!eligible) return;

  const subscriptions = await getActiveSubscriptions(customerId);

  for (const sub of subscriptions) {
    const hasCoupon = sub.discounts?.some((d) => {
      if (typeof d === "string") return false;
      const coupon = d.source?.coupon;
      if (!coupon) return false;
      return typeof coupon === "string" ? coupon === BUNDLE_DISCOUNT_COUPON_ID : coupon.id === BUNDLE_DISCOUNT_COUPON_ID;
    }) ?? false;
    if (hasCoupon) continue;

    try {
      await stripe.subscriptions.update(sub.id, {
        discounts: [{ coupon: BUNDLE_DISCOUNT_COUPON_ID }],
      });
      console.log(`[stripe] Applied bundle discount to subscription ${sub.id}`);
    } catch (err) {
      console.error(`[stripe] Failed to apply bundle discount to ${sub.id}:`, err);
    }
  }
};

/**
 * Remove the bundle discount coupon from all Stripe subscriptions if user
 * no longer qualifies (fewer than 2 distinct app subscriptions).
 */
export const removeBundleDiscountIfIneligible = async (
  customerId: string,
  userId: string
): Promise<void> => {
  if (!BUNDLE_DISCOUNT_COUPON_ID) return;

  const { eligible } = await getBundleEligibility(userId);
  if (eligible) return; // Still qualifies, keep discount

  const subscriptions = await getActiveSubscriptions(customerId);

  for (const sub of subscriptions) {
    const hasCoupon = sub.discounts?.some((d) => {
      if (typeof d === "string") return false;
      const coupon = d.source?.coupon;
      if (!coupon) return false;
      return typeof coupon === "string" ? coupon === BUNDLE_DISCOUNT_COUPON_ID : coupon.id === BUNDLE_DISCOUNT_COUPON_ID;
    }) ?? false;
    if (!hasCoupon) continue;

    try {
      await stripe.subscriptions.update(sub.id, {
        discounts: [],
      });
      console.log(`[stripe] Removed bundle discount from subscription ${sub.id}`);
    } catch (err) {
      console.error(`[stripe] Failed to remove bundle discount from ${sub.id}:`, err);
    }
  }
};

// ---------------------------------------------------------------------------
// Dual trial
// ---------------------------------------------------------------------------

/**
 * Check if a user is eligible for a dual trial (Keywords + LABS).
 * Only eligible if BOTH apps have never been trialed/subscribed.
 */
export const checkDualTrialEligibility = async (
  userId: string,
  customerId: string
): Promise<{ eligible: boolean; reason?: string }> => {
  const appKeys = getDualTrialAppKeys();

  for (const appKey of appKeys) {
    const result = await checkTrialEligibility(userId, appKey, customerId);
    if (!result.eligible) {
      return {
        eligible: false,
        reason: `Not eligible for dual trial: ${result.reason}`,
      };
    }
  }

  return { eligible: true };
};

/**
 * Create a Stripe Checkout session for the dual trial $2 setup fee.
 * mode: "payment" — just collects the fee. Subscriptions are created by the webhook.
 */
export const createDualTrialCheckoutSession = async (
  opts: {
    customerId?: string;
    customerEmail?: string;
    userId?: string;
    successUrl: string;
    cancelUrl: string;
    flow?: string;
  }
): Promise<Stripe.Checkout.Session> => {
  if (!DUAL_TRIAL_SETUP_FEE_PRICE_ID) {
    throw new HttpError(500, "STRIPE_PRICE_DUAL_TRIAL_SETUP_FEE is not configured");
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: [{ price: DUAL_TRIAL_SETUP_FEE_PRICE_ID, quantity: 1 }],
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    payment_intent_data: {
      metadata: {
        type: "dual_trial",
        ...(opts.userId ? { user_id: opts.userId } : {}),
      },
    },
    metadata: {
      type: "dual_trial",
      ...(opts.userId ? { user_id: opts.userId } : {}),
      ...(opts.flow ? { flow: opts.flow } : {}),
    },
  };

  if (opts.customerId) {
    sessionParams.customer = opts.customerId;
  } else if (opts.customerEmail) {
    sessionParams.customer_email = opts.customerEmail;
  }

  return stripe.checkout.sessions.create(sessionParams);
};

/**
 * Provision two trial subscriptions (Keywords + LABS) after dual trial payment.
 * Called by webhook on checkout.session.completed with type === "dual_trial".
 */
export const provisionDualTrialSubscriptions = async (
  customerId: string,
  userId: string
): Promise<void> => {
  const tiers = getDualTrialTiers();

  for (const { appKey, tier } of tiers) {
    const plan = findSubscriptionPlan(appKey, tier);
    if (!plan) {
      console.error(`[stripe] No plan found for ${appKey}:${tier}, skipping dual trial provision`);
      continue;
    }

    // Create Stripe subscription with 7-day trial
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceIdMonthly }],
      trial_period_days: 7,
      metadata: { app_key: appKey, source: "dual_trial" },
    });

    // Sync to app_subscriptions table
    await syncAppSubscription(userId, subscription, appKey);

    console.log(`[stripe] Created dual trial subscription for ${appKey}: ${subscription.id}`);
  }

  // Allocate 100 trial credits (shared across both apps)
  const trialCredits = getTrialCreditsForApp("dual_trial");
  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 7);

  await allocateTrialCredits(userId, trialCredits, "dual_trial", trialEndsAt, `dual_trial_${customerId}`);
  console.log(`[stripe] Allocated ${trialCredits} dual trial credits for user ${userId}`);
};

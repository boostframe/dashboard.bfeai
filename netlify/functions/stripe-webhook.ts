import type { Handler } from "@netlify/functions";
import { jsonResponse } from "./utils/http";
import {
  constructWebhookEvent,
  isEventProcessed,
  markEventProcessed,
  syncAppSubscription,
  getUserIdFromStripeCustomer,
  applyBundleDiscountIfEligible,
  removeBundleDiscountIfIneligible,
  updateUserTier,
  stripe,
} from "./utils/stripe";
import { supabaseAdmin } from "./utils/supabase-admin";
import {
  allocateSubscriptionCredits,
  allocateTopUpCredits,
  allocateTrialCredits,
  expireTrialCredits,
  mergeTrialCredits,
  recalculateSubscriptionCap,
} from "./utils/credits";
import { getMonthlyCreditsForSubscription, getTrialCreditsForApp, findSubscriptionByPriceId, findSubscriptionPlan } from "../../config/plans";
import { sendTrialReminderEmail, sendWelcomeEmail } from "./utils/email";
import type Stripe from "stripe";

/**
 * Stripe webhook handler.
 * Does NOT use withErrorHandling/requireAuth because Stripe sends raw POST requests.
 */
export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const signature = event.headers["stripe-signature"];
  if (!signature || !event.body) {
    return jsonResponse(400, { error: "Missing signature or body" });
  }

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = constructWebhookEvent(event.body, signature);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return jsonResponse(400, { error: "Invalid signature" });
  }

  // Idempotency check
  if (await isEventProcessed(stripeEvent.id)) {
    return jsonResponse(200, { received: true, duplicate: true });
  }

  try {
    switch (stripeEvent.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(stripeEvent.data.object as Stripe.Checkout.Session);
        break;

      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(stripeEvent.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionUpdated(stripeEvent.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(stripeEvent.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.paused":
        await handleSubscriptionPaused(stripeEvent.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.resumed":
        await handleSubscriptionResumed(stripeEvent.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(stripeEvent.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.trial_will_end":
        await handleTrialWillEnd(stripeEvent.data.object as Stripe.Subscription);
        break;

      case "invoice.payment_action_required":
        await handleInvoiceActionRequired(stripeEvent.data.object as Stripe.Invoice);
        break;

      default:
        console.log(`[stripe-webhook] Unhandled event type: ${stripeEvent.type}`);
    }

    await markEventProcessed(stripeEvent.id, stripeEvent.type);
  } catch (err) {
    console.error(`[stripe-webhook] Error handling ${stripeEvent.type}:`, err);
    return jsonResponse(500, { error: "Webhook handler error" });
  }

  return jsonResponse(200, { received: true });
};

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const customerId = typeof session.customer === "string"
    ? session.customer
    : session.customer?.id;

  if (!customerId) {
    console.error("[stripe-webhook] No customer on checkout session");
    return;
  }

  let userId = await getUserIdFromStripeCustomer(customerId);

  // Unauthenticated trial flow: auto-provision account if needed
  if (!userId && session.metadata?.flow === "unauthenticated") {
    userId = await provisionUnauthenticatedTrialUser(customerId);
    if (!userId) {
      console.error("[stripe-webhook] Failed to provision user for unauthenticated checkout, customer:", customerId);
      return;
    }
  }

  if (!userId) {
    console.error("[stripe-webhook] No BFEAI user for Stripe customer:", customerId);
    return;
  }

  const metadataType = session.metadata?.type;

  if (metadataType === "topup") {
    // One-time credit top-up purchase
    const credits = parseInt(session.metadata?.credits ?? "0", 10);
    const packName = session.metadata?.pack_name ?? "Top-up";

    if (credits > 0) {
      await allocateTopUpCredits(userId, credits, packName, session.id);
      console.log(`[stripe-webhook] Allocated ${credits} top-up credits for user ${userId}`);
    }
  } else if (metadataType === "trial") {
    // Trial subscription checkout
    const appKey = session.metadata?.app_key ?? "keywords";
    const trialCredits = getTrialCreditsForApp(appKey);

    // Trial ends 7 days from now
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    await allocateTrialCredits(userId, trialCredits, appKey, trialEndsAt, session.id);
    console.log(`[stripe-webhook] Allocated ${trialCredits} trial credits for ${appKey}, user ${userId}, expires ${trialEndsAt.toISOString()}`);
  } else {
    // Subscription checkout — sync handled by subscription.updated event
    const appKey = session.metadata?.app_key ?? "keywords";
    console.log(`[stripe-webhook] Checkout completed for ${appKey} subscription, user ${userId}`);
  }

  // --- Beta tester auto-tagging via promo code ---
  await detectAndTagBetaTester(session, userId);
}

// ---------------------------------------------------------------------------
// Unauthenticated trial provisioning
// ---------------------------------------------------------------------------

const APP_DISPLAY_NAMES: Record<string, string> = {
  keywords: "BFEAI Keywords",
  labs: "BFEAI LABS",
};

/**
 * Auto-provision a BFEAI account for a user who completed checkout without being logged in.
 * Returns the userId on success, null on failure.
 */
async function provisionUnauthenticatedTrialUser(customerId: string): Promise<string | null> {
  try {
    // 1. Get email from Stripe customer
    const customer = await stripe.customers.retrieve(customerId);
    if (customer.deleted || !customer.email) {
      console.error("[stripe-webhook] No email on Stripe customer:", customerId);
      return null;
    }
    const email = customer.email;

    // 2. Check if BFEAI account already exists for this email
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    let userId: string;
    let isNewUser = false;

    if (existingProfile) {
      // 3a. Existing account — link Stripe customer, skip welcome email
      userId = existingProfile.id;
      console.log(`[stripe-webhook] Linking existing user ${userId} to Stripe customer ${customerId}`);
    } else {
      // 3b. New user — create account via Supabase Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true, // Skip email verification (they confirmed via Stripe)
      });

      if (authError || !authData.user) {
        console.error("[stripe-webhook] Failed to create user:", authError?.message);
        return null;
      }

      userId = authData.user.id;
      isNewUser = true;
      console.log(`[stripe-webhook] Created new user ${userId} for email ${email}`);
    }

    // 4. Upsert profiles with email + stripe_customer_id
    //    (DB trigger from auth.users creates profile row but doesn't set email)
    await supabaseAdmin
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          stripe_customer_id: customerId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );

    // 5. Link Stripe customer to BFEAI user
    await stripe.customers.update(customerId, {
      metadata: { bfeai_user_id: userId },
    });

    // 6. Send welcome email with password reset link (new users only)
    if (isNewUser) {
      try {
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email,
        });

        if (!linkError && linkData?.properties?.action_link) {
          // Replace Supabase's default redirect with our reset-password page
          const resetUrl = new URL(linkData.properties.action_link);
          const token = resetUrl.searchParams.get("token") ?? resetUrl.hash;
          const resetLink = `https://dashboard.bfeai.com/reset-password?token_hash=${encodeURIComponent(token)}&type=recovery`;

          // Determine app name from customer metadata or default
          const appKey = (customer.metadata as Record<string, string>)?.app_key ?? "keywords";
          const appName = APP_DISPLAY_NAMES[appKey] ?? `BFEAI ${appKey}`;
          const plan = findSubscriptionPlan(appKey);

          await sendWelcomeEmail(email, {
            appName,
            resetLink,
            trialDays: 7,
            chargeAmount: plan ? `$${plan.monthlyPrice}/mo` : "$29/mo",
          });
        }
      } catch (err) {
        // Fire-and-forget — user can request password reset manually
        console.warn("[stripe-webhook] Failed to send welcome email:", err);
      }
    }

    return userId;
  } catch (err) {
    console.error("[stripe-webhook] Error provisioning unauthenticated user:", err);
    return null;
  }
}

/**
 * Check if the checkout session used a beta tester promo code (beefy-*-20).
 * If so, upgrade the user's tier to 'beta_tester' (won't overwrite 'founder').
 */
async function detectAndTagBetaTester(
  session: Stripe.Checkout.Session,
  userId: string
): Promise<void> {
  try {
    // Stripe v20: session.discounts is an array, not session.discount
    const discounts = session.discounts;
    if (!discounts || discounts.length === 0) return;

    for (const discount of discounts) {
      const promoRef = discount.promotion_code;
      if (!promoRef) continue;

      // promotion_code may be a string ID (unexpanded) or an object
      let promoCode: string;
      if (typeof promoRef === "string") {
        const promo = await stripe.promotionCodes.retrieve(promoRef);
        promoCode = promo.code;
      } else {
        promoCode = promoRef.code;
      }

      // Match beta tester pattern: starts with "beefy-" and ends with "-20"
      if (/^beefy-.+-20$/.test(promoCode)) {
        await updateUserTier(userId, "beta_tester");
        console.log(`[stripe-webhook] Tagged user ${userId} as beta_tester (promo: ${promoCode})`);
        return; // Only need to tag once
      }
    }
  } catch (err) {
    // Non-critical — log and continue
    console.warn("[stripe-webhook] Error checking promo code for beta tester tagging:", err);
  }
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  // Only allocate credits for subscription invoices (not one-time payments)
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) return;

  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  if (!userId) {
    console.error("[stripe-webhook] No BFEAI user for Stripe customer:", customerId);
    return;
  }

  // Get appKey from subscription metadata (supports multiple apps)
  const subscriptionId = typeof subscriptionRef === "string"
    ? subscriptionRef
    : (subscriptionRef as { id: string }).id;

  let appKey = "keywords";
  let priceId: string | undefined;

  try {
    const { stripe } = await import("./utils/stripe");
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    appKey = subscription.metadata?.app_key ?? "keywords";

    // Get the price ID from subscription items for credit lookup
    const firstItem = subscription.items?.data?.[0];
    if (firstItem) {
      priceId = typeof firstItem.price === "string" ? firstItem.price : firstItem.price?.id;
    }

    // --- NEW: Trial billing_reason checks (inside the try block) ---
    const billingReason = invoice.billing_reason;

    if (billingReason === "subscription_create" && subscription.status === "trialing") {
      // This is the $1 setup fee invoice for a trial — do NOT allocate subscription credits
      console.log(`[stripe-webhook] Skipping credit allocation for trial setup fee invoice ${invoice.id}, user ${userId}`);
      return;
    }

    // Check if this is a trial-to-paid conversion (first subscription_cycle after trial)
    if (billingReason === "subscription_cycle") {
      // Merge any remaining trial credits into subscription pool
      const { merged } = await mergeTrialCredits(userId, appKey);
      if (merged > 0) {
        console.log(`[stripe-webhook] Merged ${merged} trial credits into subscription for ${appKey}, user ${userId}`);
      }
    }
    // --- END NEW ---
  } catch (err) {
    console.warn("[stripe-webhook] Could not retrieve subscription metadata, using defaults:", err);
  }

  // Look up the correct monthly credits for this app/tier
  const monthlyCredits = getMonthlyCreditsForSubscription(appKey, priceId);

  // Allocate monthly subscription credits (respects 3x cap)
  const { allocated } = await allocateSubscriptionCredits(
    userId,
    monthlyCredits,
    appKey,
    invoice.id
  );

  // Ensure cap is in sync after allocation (handles new subscription + renewal)
  await recalculateSubscriptionCap(userId);

  console.log(`[stripe-webhook] Allocated ${allocated}/${monthlyCredits} subscription credits for ${appKey}, user ${userId} (invoice: ${invoice.id})`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  if (!userId) return;

  const appKey = subscription.metadata?.app_key ?? "keywords";
  await syncAppSubscription(userId, subscription, appKey);

  // Recalculate credit cap based on all active subscriptions
  const newCap = await recalculateSubscriptionCap(userId);
  console.log(`[stripe-webhook] Recalculated cap for user ${userId}: ${newCap}`);

  // Bundle discount: apply if 2+ apps, remove if <2
  await applyBundleDiscountIfEligible(customerId, userId);
  await removeBundleDiscountIfIneligible(customerId, userId);

  // Detect trial ending: subscription was trialing, now is something else
  // Check if trial_end exists and has passed, and status is no longer 'trialing'
  if (subscription.status !== "trialing" && subscription.trial_end) {
    // Trial has ended — expire or merge depending on new status
    if (subscription.status === "active") {
      // Trial converted to paid — mergeTrialCredits is handled by invoice.payment_succeeded
      // Just log here for visibility
      console.log(`[stripe-webhook] Trial converted to active for ${appKey}, user ${userId}`);
    } else {
      // Trial canceled/expired without conversion — expire trial credits
      await expireTrialCredits(userId, appKey, `Trial ended with status: ${subscription.status}`);
      console.log(`[stripe-webhook] Trial credits expired for ${appKey}, user ${userId}, status: ${subscription.status}`);
    }
  }

  console.log(`[stripe-webhook] Synced subscription ${subscription.id} for user ${userId}, status: ${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  if (!userId) return;

  const appKey = subscription.metadata?.app_key ?? "keywords";
  await syncAppSubscription(userId, subscription, appKey);

  // Recalculate cap and remove bundle discount if no longer eligible
  const newCap = await recalculateSubscriptionCap(userId);
  console.log(`[stripe-webhook] Recalculated cap for user ${userId} after deletion: ${newCap}`);
  await removeBundleDiscountIfIneligible(customerId, userId);

  console.log(`[stripe-webhook] Subscription ${subscription.id} deleted for user ${userId}`);
}

async function handleSubscriptionPaused(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  if (!userId) return;

  const appKey = subscription.metadata?.app_key ?? "keywords";
  await syncAppSubscription(userId, subscription, appKey);

  // Paused subs don't count as active — recalculate cap and check bundle
  const newCap = await recalculateSubscriptionCap(userId);
  console.log(`[stripe-webhook] Recalculated cap for user ${userId} after pause: ${newCap}`);
  await removeBundleDiscountIfIneligible(customerId, userId);

  console.log(`[stripe-webhook] Subscription ${subscription.id} paused for user ${userId}`);
}

async function handleSubscriptionResumed(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  if (!userId) return;

  const appKey = subscription.metadata?.app_key ?? "keywords";
  await syncAppSubscription(userId, subscription, appKey);

  // Resumed sub is active again — recalculate cap and check bundle eligibility
  const newCap = await recalculateSubscriptionCap(userId);
  console.log(`[stripe-webhook] Recalculated cap for user ${userId} after resume: ${newCap}`);
  await applyBundleDiscountIfEligible(customerId, userId);

  console.log(`[stripe-webhook] Subscription ${subscription.id} resumed for user ${userId}`);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;

  console.error(
    `[stripe-webhook] Payment failed for user ${userId ?? "unknown"}, ` +
    `invoice ${invoice.id}, subscription ${subscriptionRef ?? "none"}, ` +
    `attempt ${invoice.attempt_count}`
  );

  // Subscription status (past_due) will be synced via customer.subscription.updated event.
  // This handler provides early visibility for logging/monitoring.
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  if (!userId) {
    console.error("[stripe-webhook] No BFEAI user for trial_will_end, customer:", customerId);
    return;
  }

  const appKey = subscription.metadata?.app_key ?? "keywords";

  // Get user email and name from Supabase
  let userEmail = "";
  let userName = "";
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .eq("id", userId)
      .single();

    userEmail = profile?.email ?? "";
    userName = profile?.full_name ?? "there";
  } catch {
    console.warn("[stripe-webhook] Could not fetch profile for trial reminder, user:", userId);
    return;
  }

  if (!userEmail) {
    console.warn("[stripe-webhook] No email for trial reminder, user:", userId);
    return;
  }

  // Determine charge amount from subscription price
  let chargeAmount = "$29/mo"; // default
  const firstItem = subscription.items?.data?.[0];
  if (firstItem) {
    const priceId = typeof firstItem.price === "string" ? firstItem.price : firstItem.price?.id;
    if (priceId) {
      const plan = findSubscriptionByPriceId(priceId);
      if (plan) {
        chargeAmount = `$${plan.monthlyPrice}/mo`;
      }
    }
  }

  // Determine app display name
  const appNames: Record<string, string> = {
    keywords: "BFEAI Keywords",
    labs: "BFEAI LABS",
  };
  const appName = appNames[appKey] ?? `BFEAI ${appKey}`;

  // Calculate charge date from trial_end
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : new Date();
  const chargeDate = trialEnd.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  await sendTrialReminderEmail(userEmail, {
    userName,
    appName,
    chargeDate,
    chargeAmount,
    cancellationUrl: "https://dashboard.bfeai.com/billing",
  });

  console.log(`[stripe-webhook] Trial reminder sent for ${appKey}, user ${userId}, trial ends ${chargeDate}`);
}

async function handleInvoiceActionRequired(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === "string"
    ? invoice.customer
    : invoice.customer?.id;

  if (!customerId) return;

  const userId = await getUserIdFromStripeCustomer(customerId);
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;

  console.warn(
    `[stripe-webhook] Payment action required (SCA/3DS) for user ${userId ?? "unknown"}, ` +
    `invoice ${invoice.id}, subscription ${subscriptionRef ?? "none"}`
  );

  // The subscription moves to 'incomplete' status until the customer completes authentication.
  // Status sync handled via customer.subscription.updated event.
}

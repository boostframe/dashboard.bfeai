import type { Handler, HandlerResponse } from "@netlify/functions";
import { jsonResponse, HttpError } from "./utils/http";
import {
  stripe,
  createPublicTrialCheckoutSession,
  checkTrialEligibility,
  getUserIdFromStripeCustomer,
} from "./utils/stripe";
import { findSubscriptionPlan } from "../../config/plans";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ---------------------------------------------------------------------------
// Rate limiting: 5 requests/hour/IP
// ---------------------------------------------------------------------------

const isUpstashConfigured =
  process.env.UPSTASH_REDIS_URL &&
  process.env.UPSTASH_REDIS_TOKEN &&
  process.env.UPSTASH_REDIS_URL.startsWith("https://") &&
  !process.env.UPSTASH_REDIS_URL.includes("your_upstash");

const rateLimiter = isUpstashConfigured
  ? new Ratelimit({
      redis: new Redis({
        url: process.env.UPSTASH_REDIS_URL!,
        token: process.env.UPSTASH_REDIS_TOKEN!,
      }),
      limiter: Ratelimit.slidingWindow(5, "1 h"),
      analytics: true,
      prefix: "ratelimit:public-checkout",
    })
  : null;

// ---------------------------------------------------------------------------
// CORS headers
// ---------------------------------------------------------------------------

const ALLOWED_ORIGINS = [
  "https://dashboard.bfeai.com",
  "https://bfeai.com",
  "https://www.bfeai.com",
];

function corsHeaders(origin?: string): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

// ---------------------------------------------------------------------------
// Valid app keys for public trials
// ---------------------------------------------------------------------------

const VALID_APP_KEYS = new Set(["keywords", "labs"]);

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://dashboard.bfeai.com";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export const handler: Handler = async (event) => {
  const origin = event.headers.origin ?? event.headers.Origin;
  const cors = corsHeaders(origin);

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return withCors(jsonResponse(405, { error: "Method not allowed" }), cors);
  }

  try {
    // Rate limiting
    if (rateLimiter) {
      const ip =
        event.headers["x-forwarded-for"]?.split(",")[0].trim() ??
        event.headers["x-real-ip"] ??
        event.headers["cf-connecting-ip"] ??
        "unknown";

      const { success } = await rateLimiter.limit(ip);
      if (!success) {
        return withCors(jsonResponse(429, { error: "Too many requests. Try again later." }), cors);
      }
    }

    // Parse body
    if (!event.body) {
      return withCors(jsonResponse(400, { error: "Missing request body" }), cors);
    }

    let appKey: string;
    let email: string | undefined;

    try {
      const body = JSON.parse(event.body);
      appKey = body.appKey;
      email = body.email?.trim()?.toLowerCase();
    } catch {
      return withCors(jsonResponse(400, { error: "Invalid JSON body" }), cors);
    }

    if (!appKey || !VALID_APP_KEYS.has(appKey)) {
      return withCors(jsonResponse(400, { error: `Invalid appKey. Must be one of: ${[...VALID_APP_KEYS].join(", ")}` }), cors);
    }

    // Look up the recurring price ID
    const plan = findSubscriptionPlan(appKey);
    const recurringPriceId = plan?.stripePriceIdMonthly;

    if (!recurringPriceId) {
      return withCors(jsonResponse(500, { error: `No price configured for ${appKey}` }), cors);
    }

    const successUrl = `${DASHBOARD_URL}/try/${appKey}?checkout=success`;
    const cancelUrl = `${DASHBOARD_URL}/try/${appKey}?checkout=cancelled`;

    // If email provided, check for existing Stripe customer + trial eligibility
    let existingCustomerId: string | undefined;

    if (email) {
      const existing = await stripe.customers.list({ email, limit: 1 });

      if (existing.data.length > 0) {
        existingCustomerId = existing.data[0].id;

        // Check if this customer has an existing BFEAI account
        const userId = await getUserIdFromStripeCustomer(existingCustomerId);

        if (userId) {
          // Check trial eligibility
          const eligibility = await checkTrialEligibility(userId, appKey, existingCustomerId);
          if (!eligibility.eligible) {
            return withCors(
              jsonResponse(409, { error: `Not eligible for trial: ${eligibility.reason}` }),
              cors
            );
          }
        }
      }
    }

    // Create the checkout session
    const session = await createPublicTrialCheckoutSession({
      customerId: existingCustomerId,
      customerEmail: existingCustomerId ? undefined : email,
      recurringPriceId,
      appKey,
      successUrl,
      cancelUrl,
    });

    return withCors(jsonResponse(200, { url: session.url }), cors);
  } catch (err) {
    if (err instanceof HttpError) {
      return withCors(jsonResponse(err.statusCode, { error: err.message }), cors);
    }
    console.error("[stripe-checkout-public] Unexpected error:", err);
    return withCors(jsonResponse(500, { error: "Internal server error" }), cors);
  }
};

function withCors(response: HandlerResponse, cors: Record<string, string>): HandlerResponse {
  return {
    ...response,
    headers: { ...response.headers, ...cors },
  };
}

// ---------------------------------------------------------------------------
// Types – match response shapes from Stripe + Credits Netlify functions
// ---------------------------------------------------------------------------

export type SubscriptionSummary = {
  id: string;
  priceId: string | null;
  appKey: string;
  status: string;
  currency: string;
  amount: number;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  isPaused: boolean;
  resumeAt: string | null;
  stripeManaged: boolean;
};

export type BillingInvoice = {
  id: string;
  status: string;
  total: number;
  currency: string;
  date: string | null;
  description?: string | null;
  invoiceUrl: string | null;
  pdfUrl: string | null;
};

export type CreditBalance = {
  subscriptionBalance: number;
  topupBalance: number;
  trialBalance: number;
  total: number;
  cap: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
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

export type SubscriptionResponse = {
  customerId: string;
  subscriptions: SubscriptionSummary[];
  recentInvoices: BillingInvoice[];
  credits: CreditBalance;
};

export type CreditHistoryResponse = {
  transactions: CreditTransaction[];
  total: number;
};

// Cancel flow responses (discriminated union on `action`)
export type CancelOfferResponse = {
  action: "offer";
  offerId: string;
  offerType: string;
  offerDetails: Record<string, unknown>;
  hasUsedOffer: boolean;
};

export type CancelAcceptedResponse = {
  action: "offer_accepted";
  offerType: string;
  message: string;
};

export type CancelledResponse = {
  action: "cancelled";
  message: string;
  subscription: {
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
  };
};

export type CancelResponse =
  | CancelOfferResponse
  | CancelAcceptedResponse
  | CancelledResponse;

// ---------------------------------------------------------------------------
// Authenticated fetch helper
// ---------------------------------------------------------------------------

const BASE_URL = "/.netlify/functions";

const authenticatedFetch = async <T>(
  path: string,
  init?: RequestInit
): Promise<T> => {
  const response = await fetch(`${BASE_URL}/${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (payload as { error?: string }).error ?? "Request failed";
    throw new Error(message);
  }

  return payload as T;
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const BillingService = {
  /** Get Keywords subscription status, recent invoices, and credit balance. */
  getSubscription: () =>
    authenticatedFetch<SubscriptionResponse>("stripe-subscriptions"),

  /** Get full invoice history (up to 50). */
  getInvoices: () =>
    authenticatedFetch<{ invoices: BillingInvoice[] }>("stripe-invoices"),

  /** Open Stripe Customer Portal for payment method / billing management. */
  createPortalSession: (returnUrl?: string) =>
    authenticatedFetch<{ url: string }>("stripe-portal", {
      method: "POST",
      body: JSON.stringify({ returnUrl }),
    }),

  /** Create a Stripe Checkout Session for a subscription. */
  createCheckout: (appKey?: string) =>
    authenticatedFetch<{ url: string }>("stripe-checkout", {
      method: "POST",
      body: JSON.stringify({ appKey: appKey ?? "keywords" }),
    }),

  /** Create a Stripe Trial Checkout Session ($1/7-day trial). */
  createTrialCheckout: (appKey: string) =>
    authenticatedFetch<{ url: string }>("stripe-checkout", {
      method: "POST",
      body: JSON.stringify({ appKey, trial: true }),
    }),

  /**
   * Cancel subscription with retention offer flow.
   *
   * First call (no acceptOffer): sends reason + feedback, returns an offer if eligible.
   * Second call (acceptOffer: true/false): accepts or declines the offer.
   */
  cancelSubscription: (data: {
    reason: string;
    feedback?: string;
    acceptOffer?: boolean;
    offerType?: string;
  }) =>
    authenticatedFetch<CancelResponse>("stripe-cancel", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // -------------------------------------------------------------------------
  // Credits
  // -------------------------------------------------------------------------

  /** Get current credit balance (subscription + topup pools). */
  getCredits: () =>
    authenticatedFetch<CreditBalance>("credits-balance"),

  /** Get credit transaction history with pagination. */
  getCreditHistory: (limit = 50, offset = 0) =>
    authenticatedFetch<CreditHistoryResponse>(
      `credits-history?limit=${limit}&offset=${offset}`
    ),

  /** Purchase a credit top-up pack. Returns Stripe Checkout URL. */
  purchaseTopUp: (packKey: string) =>
    authenticatedFetch<{ url: string }>("credits-topup", {
      method: "POST",
      body: JSON.stringify({ packKey }),
    }),
};

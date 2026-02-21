# CLAUDE.md - Dashboard (dashboard.bfeai)

This file provides guidance to Claude Code for working with the BFEAI Dashboard — the unified authentication and billing hub for the BFEAI ecosystem.

---

## 1. Project Overview

**Purpose:** Central authentication + billing portal for the BFEAI multi-app SaaS ecosystem. Provides Single Sign-On (SSO) via JWT cookies shared across all `*.bfeai.com` subdomains, plus subscription management, credit system, and Stripe billing via Netlify Functions.

**Key Features:**
- User login, signup, and password reset
- OAuth authentication (Google)
- Profile management with avatar upload
- Session management across all BFEAI apps
- Account deletion with data cleanup
- Per-app subscriptions via Stripe
- Dual-pool credit system (subscription + top-up)
- Credit top-up packs (5 tiers)
- Stripe Customer Portal integration
- Invoice and credit transaction history
- 4-step cancellation flow with retention offers
- App marketplace
- Security features: rate limiting, CSRF, XSS protection

**Production URL:** https://dashboard.bfeai.com

**History:** This app was created by merging accounts.bfeai (SSO auth) and payments.bfeai (billing portal) in Feb 2026.

---

## 2. Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 3.4 + tailwindcss-animate |
| Components | @bfeai/ui (shared sidebar) + Radix UI |
| State | TanStack Query v5 |
| Forms | React Hook Form + Zod validation |
| Auth | Supabase Auth + custom JWT for SSO |
| Database | Supabase (shared BFEAI project) |
| Billing | Stripe v20.3.1 (via Netlify Functions) |
| Email | Resend |
| Security | Upstash Redis (rate limiting), bcryptjs, DOMPurify |
| Deployment | Netlify |

---

## 3. File Structure

**Important:** This app has NO `src/` directory — `app/`, `lib/`, `components/`, `hooks/` are all at root.

```
dashboard.bfeai/
├── app/
│   ├── layout.tsx                      # Root layout (providers, metadata)
│   ├── page.tsx                        # Home (redirects to dashboard)
│   ├── not-found.tsx                   # 404 page
│   ├── error.tsx                       # Error boundary
│   │
│   ├── login/page.tsx                  # Login page
│   ├── signup/page.tsx                 # Signup page
│   ├── logout/page.tsx                 # Logout handler (clears SSO cookie)
│   ├── forgot-password/page.tsx        # Password reset request
│   ├── reset-password/page.tsx         # Password reset completion
│   ├── oauth-start/page.tsx            # OAuth flow initiation
│   ├── sso-complete/page.tsx           # SSO completion redirect
│   ├── sso-exchange/page.tsx           # SSO token exchange (cross-app)
│   ├── sso-landing/page.tsx            # SSO landing handler
│   ├── terms/page.tsx                  # Terms of service
│   ├── privacy/page.tsx                # Privacy policy
│   │
│   ├── (dashboard)/                    # Auth-protected routes
│   │   ├── layout.tsx                  # DashboardShell + server-side JWT check
│   │   ├── page.tsx                    # Dashboard home (billing overview)
│   │   ├── DashboardPage.tsx           # Dashboard client component
│   │   ├── profile/page.tsx            # Profile management
│   │   ├── billing/page.tsx            # Billing & invoices
│   │   ├── credits/page.tsx            # Credit balance + top-ups
│   │   ├── apps/page.tsx               # App marketplace
│   │   └── settings/
│   │       ├── page.tsx                # Settings overview
│   │       ├── password/page.tsx       # Change password
│   │       └── delete/page.tsx         # Delete account
│   │
│   └── api/
│       ├── health/route.ts             # Health check
│       ├── csrf/route.ts               # CSRF token
│       ├── bugs/route.ts               # Bug reports
│       ├── credits/route.ts            # Credit balance (Next.js API)
│       ├── auth/
│       │   ├── login/route.ts          # POST: Login + set JWT cookie
│       │   ├── signup/route.ts         # POST: Create user + profile
│       │   ├── logout/route.ts         # POST: Clear SSO cookie
│       │   ├── session/route.ts        # GET: Current session
│       │   ├── forgot-password/route.ts
│       │   ├── reset-password/route.ts
│       │   ├── change-password/route.ts
│       │   ├── set-sso-cookie/route.ts
│       │   ├── set-oauth-redirect/route.ts
│       │   ├── oauth/route.ts          # GET: OAuth initiation
│       │   ├── callback/[provider]/route.ts  # OAuth callback
│       │   ├── generate-code/route.ts  # SSO code generation
│       │   └── exchange-code/route.ts  # SSO code exchange
│       ├── profile/
│       │   ├── route.ts                # GET/PUT: Profile CRUD
│       │   └── avatar/route.ts         # POST: Avatar upload
│       └── account/
│           ├── delete/route.ts         # DELETE: Account deletion
│           └── export/route.ts         # GET: Data export
│
├── netlify/
│   └── functions/                      # Serverless billing APIs
│       ├── stripe-checkout.ts          # Create Stripe checkout session
│       ├── stripe-subscriptions.ts     # GET subscription summary
│       ├── stripe-invoices.ts          # GET invoice history
│       ├── stripe-portal.ts            # Create Stripe Customer Portal session
│       ├── stripe-cancel.ts            # Cancel with retention offers
│       ├── stripe-webhook.ts           # Stripe webhook handler (8 events)
│       ├── credits-balance.ts          # GET credit balance (dual pool)
│       ├── credits-history.ts          # GET credit transaction history
│       ├── credits-check.ts            # POST check sufficient credits
│       ├── credits-deduct.ts           # POST deduct credits
│       ├── credits-topup.ts            # POST create top-up checkout
│       ├── settings-get.ts             # GET user settings
│       ├── settings-update.ts          # POST update settings
│       ├── settings-update-profile.ts  # POST update profile
│       ├── bug-report.ts               # POST bug report
│       ├── trial-data-cleanup.ts       # Scheduled cleanup
│       ├── inactivity-anonymization.ts # GDPR compliance
│       └── utils/
│           ├── http.ts                 # withErrorHandling, jsonResponse
│           ├── stripe.ts               # Stripe client, customer mgmt
│           ├── credits.ts              # Credit allocation, deduction
│           ├── supabase-admin.ts       # Supabase admin client, requireAuth
│           ├── email.ts                # Resend email client
│           └── email-templates.ts      # Email HTML templates
│
├── lib/
│   ├── auth/
│   │   ├── jwt.ts                      # JWT generation & verification
│   │   ├── session.ts                  # Session management
│   │   ├── cookies.ts                  # SSO cookie helpers
│   │   └── oauth.ts                    # OAuth provider config
│   ├── stripe-env.ts                   # Stripe test/live key resolver
│   ├── security/
│   │   ├── rate-limiter.ts             # Upstash rate limiting
│   │   ├── account-lockout.ts          # Failed login lockout
│   │   ├── session-manager.ts          # Session tracking
│   │   ├── csrf.ts                     # CSRF token management
│   │   ├── xss-protection.ts          # DOMPurify sanitization
│   │   └── recaptcha.ts               # reCAPTCHA verification
│   ├── supabase/
│   │   ├── client.ts                   # Browser client
│   │   ├── server.ts                   # Server client (SSR)
│   │   └── admin.ts                    # Service role client
│   ├── storage/
│   │   └── avatar.ts                   # Avatar upload to Supabase Storage
│   ├── validation/
│   │   └── schemas.ts                  # Zod validation schemas
│   └── utils.ts                        # General utilities (cn, etc.)
│
├── hooks/
│   ├── useBilling.ts                   # Stripe billing operations (TanStack Query)
│   ├── useCredits.ts                   # Credit balance + top-up operations
│   ├── use-credits.ts                  # Legacy credit hook (alias)
│   ├── useCancellation.ts              # 4-step cancellation flow
│   ├── useProfile.ts                   # Profile management
│   └── useUserSettings.ts              # User preferences
│
├── services/
│   ├── BillingService.ts               # Stripe API calls via Netlify Functions
│   ├── ProfileService.ts               # Profile operations
│   └── SettingsService.ts              # Settings CRUD
│
├── config/
│   ├── plans.ts                        # Per-app subscription plans + top-up packs
│   ├── apps.ts                         # App catalog (with pricing)
│   └── appUrl.ts                       # App URL routing
│
├── components/
│   ├── layout/
│   │   └── DashboardShell.tsx          # Sidebar nav + main layout (uses @bfeai/ui AppSidebar)
│   ├── billing/
│   │   ├── AppSubscriptionCard.tsx     # Current subscription display
│   │   ├── CreditBalanceCard.tsx       # Credit balance (dual pool)
│   │   ├── CreditHistoryTable.tsx      # Credit transaction history
│   │   ├── TopUpPacksGrid.tsx          # Credit top-up purchase grid
│   │   └── CancellationDialog.tsx      # 4-step cancellation flow
│   ├── providers/
│   │   └── query-provider.tsx          # TanStack Query provider
│   └── ui/                             # Radix UI components
│
├── packages/
│   └── ui/                             # @bfeai/ui shared component library
│
├── shared-auth-library/                # Template files for other apps
│   ├── index.ts
│   ├── types.ts
│   ├── authHelpers.ts
│   ├── useAuth.ts
│   ├── AuthProvider.tsx
│   ├── subscriptionCheck.ts
│   └── middleware-template.ts
│
├── tests/e2e/                          # Playwright tests
├── middleware.ts                        # Auth + route protection
├── netlify.toml                         # Netlify deployment config
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

---

## 4. SSO Cookie Architecture

The core purpose of this service is managing the SSO cookie that enables authentication across all BFEAI apps.

### Cookie Configuration

```typescript
// lib/auth/cookies.ts
export const SSO_COOKIE_NAME = 'bfeai_session';

export function setSSoCookie(token: string) {
  cookies().set(SSO_COOKIE_NAME, token, {
    domain: '.bfeai.com',     // Leading dot = all subdomains
    httpOnly: true,           // Prevent JavaScript access
    secure: true,             // HTTPS only
    sameSite: 'lax',          // CSRF protection
    maxAge: 7 * 24 * 60 * 60, // 7 days
    path: '/',
  });
}
```

### Cookie Accessibility

The `.bfeai.com` domain cookie is readable by:
- `dashboard.bfeai.com` ✓
- `keywords.bfeai.com` ✓
- `labs.bfeai.com` ✓
- `admin.bfeai.com` ✓
- Any future `*.bfeai.com` subdomain ✓

---

## 5. Authentication Flows

### Login Flow

1. User submits email/password to `/api/auth/login`
2. Validate against Supabase Auth
3. Check rate limits and account lockout
4. Generate JWT token with user data
5. Set SSO cookie on `.bfeai.com` domain
6. Redirect to `?redirect=` URL or dashboard

### Signup Flow

1. User submits email/password/name to `/api/auth/signup`
2. Validate with Zod schema
3. Create user in Supabase Auth
4. Create profile in `public.profiles` table
5. Generate JWT token + set SSO cookie
6. Redirect to onboarding or redirect URL

### OAuth Flow (Google)

1. User clicks "Login with Google"
2. Store redirect URL via `/api/auth/set-oauth-redirect`
3. Redirect to `/api/auth/oauth?provider=google`
4. Supabase handles OAuth handshake
5. Callback at `/api/auth/callback/google`
6. Create/update profile, set SSO cookie
7. Redirect to stored URL

### Logout Flow

1. User visits `/logout`
2. Call `/api/auth/logout` to clear cookie
3. Sign out of Supabase session
4. Redirect to login page

---

## 6. Credits System

### Dual-Pool Architecture

| Pool | Source | Cap | Drain Order |
|------|--------|-----|-------------|
| `subscription_balance` | Monthly allocation (300/mo) | 3x monthly = 900 max | Second |
| `topup_balance` | One-time purchases | Uncapped | First |

Top-up credits drain first, then subscription credits.

### Top-Up Packs

| Pack | Credits | Price |
|------|---------|-------|
| Starter Boost | 75 | $9 |
| Builder Pack | 270 | $29 |
| Power Pack | 980 | $99 |
| Pro Pack | 2,500 | $249 |
| Max Pack | 5,250 | $499 |

Credits never expire and are used before subscription credits.

---

## 7. Billing (Netlify Functions)

All billing operations go through Netlify Functions that call Stripe API.

| Function | Method | Purpose |
|----------|--------|---------|
| `stripe-subscriptions` | GET | Current subscription + customer info |
| `stripe-invoices` | GET | Invoice history |
| `stripe-portal` | POST | Create Stripe Customer Portal session |
| `stripe-checkout` | POST | Create checkout session |
| `stripe-cancel` | POST | Cancel with retention offers |
| `stripe-webhook` | POST | Handle Stripe webhook events (8 types) |
| `credits-balance` | GET | Current credit balance (dual pool) |
| `credits-history` | GET | Credit transaction history |
| `credits-check` | POST | Check sufficient credits |
| `credits-deduct` | POST | Deduct credits for operation |
| `credits-topup` | POST | Create top-up checkout session |

### Stripe Test Mode

Toggle via `STRIPE_TEST_MODE` env var. When `true`, `getStripeEnv()` (in `lib/stripe-env.ts`) reads `<NAME>_TEST` env vars instead of live ones. All Netlify Functions and `config/plans.ts` use this resolver.

### Stripe Webhook Events

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | New subscription or top-up credit allocation |
| `invoice.payment_succeeded` | Monthly credit allocation (respects 3x cap) |
| `invoice.payment_failed` | Log payment failure |
| `invoice.payment_action_required` | Log SCA/3DS needed |
| `customer.subscription.updated` | Sync status/period to app_subscriptions |
| `customer.subscription.deleted` | Sync final cancellation |
| `customer.subscription.paused` | Sync pause state |
| `customer.subscription.resumed` | Sync resume state |

---

## 8. API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/health` | GET | Health check |
| `/api/csrf` | GET | CSRF token |
| `/api/bugs` | POST | Bug reports |
| `/api/credits` | GET | Credit balance |
| `/api/auth/login` | POST | Login + set SSO cookie |
| `/api/auth/signup` | POST | Create user + profile |
| `/api/auth/logout` | POST | Clear SSO cookie |
| `/api/auth/session` | GET | Current session |
| `/api/auth/forgot-password` | POST | Send reset email |
| `/api/auth/reset-password` | POST | Complete password reset |
| `/api/auth/change-password` | POST | Change password |
| `/api/auth/set-sso-cookie` | POST | Set SSO cookie |
| `/api/auth/oauth` | GET | Start OAuth flow |
| `/api/auth/callback/[provider]` | GET | OAuth callback |
| `/api/auth/generate-code` | POST | SSO code generation |
| `/api/auth/exchange-code` | POST | SSO code exchange |
| `/api/profile` | GET/PUT | Profile CRUD |
| `/api/profile/avatar` | POST | Avatar upload |
| `/api/account/delete` | DELETE | Delete account |
| `/api/account/export` | GET | Data export |

---

## 9. Pages Overview

### Public Pages

| Page | Path | Description |
|------|------|-------------|
| Login | `/login` | Email/password + OAuth login |
| Signup | `/signup` | Registration form |
| Forgot Password | `/forgot-password` | Request password reset |
| Reset Password | `/reset-password` | Set new password |
| OAuth Start | `/oauth-start` | OAuth flow initiation |
| SSO Complete | `/sso-complete` | SSO redirect handler |
| SSO Exchange | `/sso-exchange` | Cross-app SSO token exchange |
| SSO Landing | `/sso-landing` | SSO landing handler |
| Logout | `/logout` | Logout and clear cookie |
| Terms | `/terms` | Terms of service |
| Privacy | `/privacy` | Privacy policy |

### Protected Pages (Dashboard)

| Page | Path | Description |
|------|------|-------------|
| Dashboard | `/` | Billing overview, credit balance, quick actions |
| Profile | `/profile` | View/edit profile, avatar upload |
| Billing | `/billing` | Invoices, subscription management, cancel |
| Credits | `/credits` | Credit balance, top-up packs, transaction history |
| Apps | `/apps` | App marketplace (subscribe/launch) |
| Settings | `/settings` | Account settings overview |
| Change Password | `/settings/password` | Update password |
| Delete Account | `/settings/delete` | Account deletion with confirmation |

---

## 10. Environment Variables

### Required

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://wmhnkxkyettbeeamuppz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# JWT (CRITICAL: must match all BFEAI apps!)
JWT_SECRET=

# App Identity
NEXT_PUBLIC_APP_NAME=dashboard
NEXT_PUBLIC_APP_URL=https://dashboard.bfeai.com
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.bfeai.com

# Stripe (Live)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Stripe Price IDs
STRIPE_PRICE_KEYWORDS_MONTHLY=
STRIPE_PRICE_KEYWORDS_YEARLY=
STRIPE_PRICE_LABS_BASE_MONTHLY=
STRIPE_PRICE_LABS_BASE_YEARLY=
STRIPE_PRICE_LABS_AEO_MONTHLY=
STRIPE_PRICE_LABS_AEO_YEARLY=
STRIPE_PRICE_TRIAL_SETUP_FEE=
STRIPE_COUPON_BUNDLE_DISCOUNT=

# Email
RESEND_API_KEY=
```

### Stripe Test Mode (Optional)

```env
STRIPE_TEST_MODE=false
STRIPE_SECRET_KEY_TEST=
STRIPE_WEBHOOK_SECRET_TEST=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST=
# ... plus _TEST variants for all STRIPE_PRICE_* and STRIPE_COUPON_*
```

### Security

```env
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
NEXT_PUBLIC_RECAPTCHA_SITE_KEY=
RECAPTCHA_SECRET_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### Build

```env
SKIP_ENV_VALIDATION=true
NODE_VERSION=20
```

---

## 11. Development Commands

```bash
npm install
npm run dev           # http://localhost:3000
npm run build         # Production build
npx tsc --noEmit      # Type check
npm run lint          # Lint
npm run test          # E2E tests (Playwright)
```

---

## 12. Database Tables

### Auth Tables

| Table | Purpose |
|-------|---------|
| `auth.users` | Managed by Supabase Auth (do not modify directly) |
| `profiles` | User profile data (name, avatar, company) |
| `security_events` | Login attempts, lockouts, audit trail |

### Billing Tables

| Table | Purpose |
|-------|---------|
| `app_subscriptions` | Per-app subscription records synced from Stripe |
| `user_credits` | Current credit balances (dual pool) |
| `credit_transactions` | Audit trail of all credit operations |
| `app_credit_config` | Per-app operation credit costs |
| `stripe_events` | Webhook idempotency tracking |
| `cancellation_offers` | Retention offers during cancellation |
| `cancellation_feedback` | User feedback on cancellation reasons |

---

## 13. Shared Auth Library

The `shared-auth-library/` directory contains template files that other BFEAI apps copy to `lib/bfeai-auth/`:

| File | Purpose |
|------|---------|
| `types.ts` | BFEAIUser, AuthState types |
| `authHelpers.ts` | decodeJWT, isTokenExpired, getDashboardUrl |
| `useAuth.ts` | React hook for auth state |
| `AuthProvider.tsx` | React context provider |
| `subscriptionCheck.ts` | Subscription verification |
| `middleware-template.ts` | Route protection template |

---

## 14. Key Patterns

### Netlify Function Auth Pattern

```typescript
import { withErrorHandling } from "./utils/http";
import { requireAuth } from "./utils/supabase-admin";

export const handler = withErrorHandling(async (event) => {
  const user = requireAuth(event);
  // ... function logic
});
```

**requireAuth gotcha:** Has two auth methods — `Authorization: Bearer` (expects Supabase auth token) and `bfeai_session` cookie (decodes JWT manually). For cross-app calls, pass raw JWT as `Cookie: bfeai_session=<token>`, NOT as Bearer.

### Stripe Test/Live Key Resolution

```typescript
// lib/stripe-env.ts
const isTestMode = process.env.STRIPE_TEST_MODE === "true";

export function getStripeEnv(name: string, fallback = ""): string {
  if (isTestMode) {
    return process.env[`${name}_TEST`] ?? process.env[name] ?? fallback;
  }
  return process.env[name] ?? fallback;
}
```

### Credit Deduction (Drain Order)

```typescript
// Top-up drains first, then subscription
const deductFromTopup = Math.min(cost, balance.topupBalance);
const deductFromSub = cost - deductFromTopup;
```

---

## 15. Stripe v20 API Gotchas

- `subscription.current_period_start/end` REMOVED — use `latest_invoice.period_start/end` (expand `latest_invoice`)
- `subscription.update({ coupon })` REMOVED — use `discounts: [{ coupon: couponId }]`
- `invoice.subscription` REMOVED — use `invoice.parent?.subscription_details?.subscription`
- Don't pass `apiVersion` to Stripe constructor — let SDK use its default
- `pause_collection` still works with `{ behavior: 'void', resumes_at: unixTimestamp }`

---

## 16. Anti-patterns to Avoid

1. **Never set cookie without `.bfeai.com` domain** — SSO breaks without leading dot
2. **Never expose JWT_SECRET or service role key** — server-side only
3. **Never clear SSO cookie from other apps** — only dashboard.bfeai can logout
4. **Never call Stripe API from client code** — always use Netlify Functions
5. **Never skip rate limiting** — always check before auth operations
6. **Never trust redirect URLs** — validate they're on `*.bfeai.com`
7. **Never hardcode credit costs** — read from `app_credit_config` table
8. **Never block on credit tracking** — fire-and-forget for non-critical ops
9. **`@bfeai/ui` must use `"file:./packages/ui"`** — never `"*"`
10. **Never skip input sanitization** — always use DOMPurify

---

## 17. Related Documentation

- **Root CLAUDE.md**: `../../CLAUDE.md`
- **SSO Architecture**: `../../docs/04-Architecture/sso-architecture.md`
- **Database Schema**: `../../docs/04-Architecture/database-schema.md`
- **Credit System**: `../../docs/04-Architecture/credit-system-integration.md`
- **Billing Events**: `../../docs/04-Architecture/billing-events-guide.md`
- **Environment Variables**: `../../docs/04-Architecture/environment-variables.md`
- **Brand Guide**: `../../docs/05-Design/BFEAI_Brand_Guide.md`
- **Keywords App**: `../keywords.bfeai/CLAUDE.md`
- **LABS App**: `../LABS/CLAUDE.md`
- **Admin App**: `../admin.bfeai/CLAUDE.md`
- **Supabase Dashboard**: https://supabase.com/dashboard/project/wmhnkxkyettbeeamuppz

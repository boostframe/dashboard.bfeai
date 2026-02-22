import { withErrorHandling, jsonResponse, HttpError } from "./utils/http";
import { requireAuth } from "./utils/supabase-admin";
import { getOrCreateStripeCustomer, createPortalSession } from "./utils/stripe";

export const handler = withErrorHandling(async (event) => {
  if (event.httpMethod !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  const { user } = await requireAuth(event);
  const email = user.email ?? "";

  if (!email) {
    throw new HttpError(400, "User email is required");
  }

  let returnUrl = "https://dashboard.bfeai.com";
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    if (body.returnUrl) {
      returnUrl = body.returnUrl;
    }
  } catch {
    // Use default returnUrl
  }

  const customerId = await getOrCreateStripeCustomer(user.id, email);
  const session = await createPortalSession(customerId, returnUrl);

  return jsonResponse(200, { url: session.url });
});

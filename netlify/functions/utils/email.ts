import { Resend } from "resend";
import { buildTrialReminderHtml, buildTrialReminderText, buildWelcomeEmailHtml, buildWelcomeEmailText } from "./email-templates";

const resendApiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.RESEND_FROM_EMAIL ?? "BFEAI <noreply@bfeai.com>";

interface TrialReminderData {
  userName: string;
  appName: string;
  chargeDate: string;
  chargeAmount: string;
  cancellationUrl: string;
}

/**
 * Send a branded trial reminder email via Resend.
 * Fire-and-forget: never throws, logs errors.
 */
export async function sendTrialReminderEmail(
  to: string,
  data: TrialReminderData
): Promise<{ success: boolean }> {
  try {
    if (!resendApiKey) {
      console.warn("[email] RESEND_API_KEY not configured, logging email instead");
      console.log("[email] Trial reminder would be sent to:", to, data);
      return { success: false };
    }

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject: `Your ${data.appName} trial ends soon`,
      html: buildTrialReminderHtml(data),
      text: buildTrialReminderText(data),
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return { success: false };
    }

    console.log(`[email] Trial reminder sent to ${to} for ${data.appName}`);
    return { success: true };
  } catch (error) {
    console.error("[email] Failed to send trial reminder:", error);
    return { success: false };
  }
}

interface WelcomeEmailData {
  appName: string;
  resetLink: string;
  trialDays: number;
  chargeAmount: string;
}

/**
 * Send a branded welcome email to a new user who signed up via public trial checkout.
 * Fire-and-forget: never throws, logs errors.
 */
export async function sendWelcomeEmail(
  to: string,
  data: WelcomeEmailData
): Promise<{ success: boolean }> {
  try {
    if (!resendApiKey) {
      console.warn("[email] RESEND_API_KEY not configured, logging email instead");
      console.log("[email] Welcome email would be sent to:", to, data);
      return { success: false };
    }

    const resend = new Resend(resendApiKey);

    const { error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject: `Welcome to BFEAI — set your password to get started`,
      html: buildWelcomeEmailHtml(data),
      text: buildWelcomeEmailText(data),
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return { success: false };
    }

    console.log(`[email] Welcome email sent to ${to} for ${data.appName}`);
    return { success: true };
  } catch (error) {
    console.error("[email] Failed to send welcome email:", error);
    return { success: false };
  }
}

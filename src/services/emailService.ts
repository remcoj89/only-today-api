import { Resend } from "resend";
import { config } from "../config";

export type SendResult = { sent: boolean; messageId?: string };

async function sendViaResend(to: string, subject: string, htmlBody: string): Promise<SendResult> {
  if (!config.resendApiKey) {
    if (config.nodeEnv === "production") {
      console.warn("[EMAIL] RESEND_API_KEY not set; email not sent", { to, subject });
    }
    return { sent: false };
  }

  const resend = new Resend(config.resendApiKey);
  const { data, error } = await resend.emails.send({
    from: config.resendFromEmail,
    to: [to],
    subject,
    html: htmlBody
  });

  if (error) {
    console.error("[EMAIL] Resend send failed", { to, subject, error });
    return { sent: false };
  }

  return { sent: true, messageId: data?.id };
}

export async function sendBlockedNotificationEmail(email: string) {
  if (config.nodeEnv === "development" || config.nodeEnv === "test") {
    console.log(`[EMAIL] Account blocked notification would be sent to: ${email}`);
    return;
  }

  const subject = "Your account has been blocked";
  const body = "<p>Your Only Today account has been blocked. Please contact support if you believe this is an error.</p>";
  await sendViaResend(email, subject, body);
}

export async function sendTransactionalEmail(to: string, subject: string, body: string): Promise<SendResult> {
  if (config.nodeEnv === "development" || config.nodeEnv === "test") {
    console.log(`[EMAIL] ${subject} -> ${to}`);
    return { sent: true };
  }

  const htmlBody = body.includes("<") ? body : `<p>${body.replace(/\n/g, "</p><p>")}</p>`;
  return sendViaResend(to, subject, htmlBody);
}

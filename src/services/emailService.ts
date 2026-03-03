import { config } from "../config";

export async function sendBlockedNotificationEmail(email: string) {
  // In development and test, emails are logged to console.
  if (config.nodeEnv === "development" || config.nodeEnv === "test") {
    console.log(`[EMAIL] Account blocked notification would be sent to: ${email}`);
    return;
  }

  if (!config.resendApiKey || !config.resendFromEmail) {
    console.warn(
      `[EMAIL] Skipping blocked notification for ${email}: RESEND_API_KEY/RESEND_FROM_EMAIL not configured.`
    );
    return;
  }

  // TODO: integrate real provider call here.
  console.info(`[EMAIL] Simulated send via Resend config to ${email} from ${config.resendFromEmail}`);
}

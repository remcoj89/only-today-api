export async function sendBlockedNotificationEmail(email: string) {
  // In development and test, emails are logged to console. In production, wire to an email provider (SendGrid, Resend, etc.).
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    console.log(`[EMAIL] Account blocked notification would be sent to: ${email}`);
    return;
  }

}

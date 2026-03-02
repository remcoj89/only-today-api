import { getSupabaseAdminClient } from "../db/client";
import { AppError } from "../errors";
import { formatDateKey } from "../utils/dateUtils";
import { sendEmail, sendPushNotification } from "../services/notificationService";
import { getConsecutiveMissedCount } from "../services/missedDaysService";

type UserSettingsRow = {
  user_id: string;
  timezone: string | null;
  push_enabled: boolean;
  email_for_escalations_enabled: boolean;
};

export async function runMissedDaysJob() {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_settings")
    .select("user_id,timezone,push_enabled,email_for_escalations_enabled");

  if (error) {
    const detail = error?.message ?? JSON.stringify(error);
    throw AppError.internal(`Failed to load user settings for missed day job: ${detail}`);
  }

  const users = (Array.isArray(data) ? data : []) as UserSettingsRow[];
  await Promise.all(
    users.map(async (user) => {
      const missedCount = await getConsecutiveMissedCount(user.user_id);
      if (missedCount < 2) {
        return;
      }

      const timeZone = user.timezone ?? "UTC";
      const dateKey = formatDateKey(new Date(), timeZone);

      if (user.push_enabled) {
        await sendPushNotification(user.user_id, {
          type: "missed_2_days_push",
          title: "You missed two days",
          body: "Open the app to get back on track.",
          data: { dateKey, missedCount: String(missedCount) },
          targetDate: dateKey
        });
      }

      if (user.email_for_escalations_enabled) {
        await sendEmail(user.user_id, {
          type: "missed_2_days_email",
          subject: "You missed two days",
          body: "We noticed you missed two days. Open the app to catch up.",
          targetDate: dateKey
        });
      }
    })
  );
}

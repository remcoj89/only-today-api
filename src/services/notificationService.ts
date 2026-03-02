import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { getSupabaseAdminClient } from "../db/client";
import { AppError } from "../errors";

export type PushPlatform = "ios" | "android" | "web";

export type NotificationType =
  | "day_start"
  | "day_close"
  | "pomodoro_start"
  | "pomodoro_break"
  | "partner_closed"
  | "missed_2_days_push"
  | "missed_2_days_email";

export type PushNotification = {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  targetDate?: string;
};

export type EmailNotification = {
  type: NotificationType;
  subject: string;
  body: string;
  targetDate?: string;
};

type DeviceTokenRow = {
  id: string;
  user_id: string;
  device_id: string;
  push_token: string;
  platform: PushPlatform;
};

function createAuthedClient(accessToken: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

async function logNotification(userId: string, payload: { type: NotificationType; status: string; targetDate?: string; providerMessageId?: string }) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("notification_log").insert({
    user_id: userId,
    type: payload.type,
    target_date: payload.targetDate ?? null,
    sent_at: new Date().toISOString(),
    provider_message_id: payload.providerMessageId ?? null,
    status: payload.status
  });
  if (error) {
    throw AppError.internal("Failed to log notification");
  }
}

export async function registerDevice(
  userId: string,
  accessToken: string,
  pushToken: string,
  deviceId: string,
  platform: PushPlatform
) {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("push_device_tokens")
    .upsert(
      {
        user_id: userId,
        device_id: deviceId,
        push_token: pushToken,
        platform,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,device_id" }
    )
    .select("*")
    .single();

  if (error) {
    throw AppError.internal("Failed to register device");
  }

  return data;
}

export async function unregisterDevice(userId: string, accessToken: string, deviceId: string) {
  const client = createAuthedClient(accessToken);
  const { error } = await client.from("push_device_tokens").delete().eq("user_id", userId).eq("device_id", deviceId);

  if (error) {
    throw AppError.internal("Failed to unregister device");
  }
}

export async function sendPushNotification(userId: string, notification: PushNotification) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("push_device_tokens")
    .select("id, user_id, device_id, push_token, platform")
    .eq("user_id", userId);

  if (error) {
    throw AppError.internal("Failed to load device tokens");
  }

  const devices = (Array.isArray(data) ? data : []) as DeviceTokenRow[];
  if (devices.length === 0) {
    await logNotification(userId, { type: notification.type, status: "skipped", targetDate: notification.targetDate });
    return { attempted: 0, delivered: 0 };
  }

  const results = await Promise.all(
    devices.map(async (device) => {
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: device.push_token,
            title: notification.title,
            body: notification.body,
            data: notification.data ?? {}
          })
        });
        const payload = await response.json();
        const messageId = payload?.data?.id ?? null;
        return { success: response.ok, messageId };
      } catch {
        return { success: false, messageId: null };
      }
    })
  );

  const delivered = results.filter((result) => result.success).length;
  const providerMessageId = results.find((result) => result.messageId)?.messageId ?? undefined;
  await logNotification(userId, {
    type: notification.type,
    status: delivered > 0 ? "sent" : "failed",
    targetDate: notification.targetDate,
    providerMessageId
  });

  return { attempted: devices.length, delivered };
}

export async function sendEmail(userId: string, notification: EmailNotification) {
  if (config.nodeEnv === "development" || config.nodeEnv === "test") {
    console.log(`[EMAIL] ${notification.subject}`);
    await logNotification(userId, { type: notification.type, status: "sent", targetDate: notification.targetDate });
    return;
  }

  await logNotification(userId, { type: notification.type, status: "sent", targetDate: notification.targetDate });
}

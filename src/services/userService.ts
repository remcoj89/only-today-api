import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";
import { getSupabaseAdminClient, getSupabaseClient } from "../db/client";
import { AppError } from "../errors";

export type UserSettingsUpdate = {
  day_start_reminder_time?: string | null;
  day_close_reminder_time?: string | null;
  push_enabled?: boolean;
  email_for_escalations_enabled?: boolean;
  timezone?: string;
  account_start_date?: string | null;
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

function isValidTimeZone(timeZone: string): boolean {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") {
    return true;
  }
  const hasSupportedValues = typeof Intl.supportedValuesOf === "function";
  if (hasSupportedValues) {
    return Intl.supportedValuesOf("timeZone").includes(timeZone);
  }
  try {
    Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export async function createUserSettings(userId: string) {
  const admin = getSupabaseAdminClient();
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/8f2b6680-c47c-4e5b-b9d7-488dc9e2d3be", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "H2",
      location: "services/userService.ts:createUserSettings",
      message: "createUserSettings.start",
      data: { hasUserId: !!userId },
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
  const { data, error } = await admin
    .from("user_settings")
    .insert({ user_id: userId })
    .select("*")
    .single();

  if (error) {
    throw AppError.internal("Failed to create user settings");
  }

  return data;
}

export async function getUserSettings(userId: string, accessToken: string) {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("user_settings")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error) {
    throw AppError.internal("Failed to load user settings");
  }

  return data;
}

export async function updateUserSettings(
  userId: string,
  accessToken: string,
  updates: UserSettingsUpdate
) {
  if (updates.timezone && !isValidTimeZone(updates.timezone)) {
    throw AppError.validationError("Invalid timezone", { timezone: updates.timezone });
  }

  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("user_settings")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error) {
    throw AppError.internal("Failed to update user settings");
  }

  return data;
}

export type UserProfile = {
  name: string;
  email: string;
};

export async function getUserProfile(userId: string): Promise<UserProfile> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);

  if (error || !data.user) {
    throw AppError.internal(error?.message ?? "Failed to load user profile");
  }

  const user = data.user;
  const name = (user.user_metadata?.name as string | undefined) ?? "";
  const email = user.email ?? "";

  return { name, email };
}

export async function updateUserProfile(userId: string, name: string): Promise<UserProfile> {
  const admin = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await admin.auth.admin.getUserById(userId);

  if (fetchError || !existing.user) {
    throw AppError.internal(fetchError?.message ?? "Failed to load user");
  }

  const userMetadata = {
    ...(existing.user.user_metadata ?? {}),
    name: name.trim()
  };

  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    user_metadata: userMetadata
  });

  if (error || !data.user) {
    throw AppError.internal(error?.message ?? "Failed to update profile");
  }

  return {
    name: (data.user.user_metadata?.name as string | undefined) ?? "",
    email: data.user.email ?? ""
  };
}

export async function updateUserPassword(
  userId: string,
  userEmail: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const client = getSupabaseClient();
  const { error: signInError } = await client.auth.signInWithPassword({
    email: userEmail,
    password: currentPassword
  });

  if (signInError) {
    throw AppError.validationError("Current password is incorrect", { field: "currentPassword" });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword
  });

  if (error) {
    throw AppError.internal(error.message);
  }
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw AppError.internal(error.message);
  }
}

export async function setAccountStartDateIfUnset(
  userId: string,
  accessToken: string,
  dateKey: string
): Promise<void> {
  const settings = await getUserSettings(userId, accessToken);
  if (settings.account_start_date != null) {
    return;
  }
  await updateUserSettings(userId, accessToken, { account_start_date: dateKey });
}

export const userServiceUtils = {
  isValidTimeZone
};

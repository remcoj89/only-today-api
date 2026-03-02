import { getSupabaseAdminClient } from "../db/client";
import { AppError } from "../errors";
import { createUserSettings } from "./userService";
import { sendBlockedNotificationEmail } from "./emailService";

type AdminActionType = "create" | "block" | "unblock" | "delete";

export async function createUser(email: string, password: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error || !data.user) {
    throw AppError.internal(error?.message ?? "Failed to create user");
  }

  await createUserSettings(data.user.id);
  return data.user;
}

async function updateBlockedStatus(userId: string, blocked: boolean) {
  const admin = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await admin.auth.admin.getUserById(userId);
  if (fetchError || !existing.user) {
    throw AppError.internal(fetchError?.message ?? "Failed to load user");
  }

  const appMetadata = {
    ...(existing.user.app_metadata ?? {}),
    blocked
  };

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: appMetadata
  });

  if (error) {
    throw AppError.internal(error.message);
  }
}

export async function blockUser(userId: string) {
  await updateBlockedStatus(userId, true);

  // Haal user email op
  const admin = getSupabaseAdminClient();
  const { data: user } = await admin.auth.admin.getUserById(userId);

  if (user?.user?.email) {
    await sendBlockedNotificationEmail(user.user.email);
  }
}

export async function unblockUser(userId: string) {
  await updateBlockedStatus(userId, false);
}

export async function deleteUser(userId: string) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw AppError.internal(error.message);
  }
}

export async function logAdminAction(
  adminId: string,
  actionType: AdminActionType,
  targetUserId: string,
  metadata?: Record<string, unknown>
) {
  const admin = getSupabaseAdminClient();
  const { error } = await admin.from("admin_user_actions").insert({
    admin_id: adminId,
    action_type: actionType,
    target_user_id: targetUserId,
    metadata: metadata ?? null
  });

  if (error) {
    throw AppError.internal("Failed to log admin action");
  }
}

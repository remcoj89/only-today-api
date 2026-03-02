import { z } from "zod";

const timeRegex = /^\d{2}:\d{2}$/;

function isValidTime(value: string): boolean {
  if (!timeRegex.test(value)) {
    return false;
  }
  const [hours, minutes] = value.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
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

const timeSchema = z.string().refine(isValidTime, {
  message: "Time must be in HH:MM format"
});

export const userSettingsUpdateSchema = z
  .object({
    day_start_reminder_time: timeSchema.optional().nullable(),
    day_close_reminder_time: timeSchema.optional().nullable(),
    push_enabled: z.boolean().optional(),
    email_for_escalations_enabled: z.boolean().optional(),
    timezone: z.string().refine(isValidTimeZone, { message: "Invalid timezone" }).optional()
  })
  .strict();

export const userProfileUpdateSchema = z
  .object({
    name: z.string().min(1, "Name is required").max(200, "Name too long")
  })
  .strict();

export const passwordUpdateSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: z.string().min(8, "Password must be at least 8 characters")
  })
  .strict();

export const accountDeleteSchema = z
  .object({
    confirmation: z.literal("DELETE", {
      errorMap: () => ({ message: "Type DELETE to confirm account deletion" })
    })
  })
  .strict();

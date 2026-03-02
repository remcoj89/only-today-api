import { addHours, subHours } from "date-fns";
import {
  DocStatus,
  type DocumentBase,
  DAY_AVAILABLE_HOURS_BEFORE,
  DAY_LOCK_HOURS_AFTER
} from "../shared";
import { getDayEnd, getDayStart } from "../utils/dateUtils";

export function isDayAvailable(
  dateKey: string,
  userTimezone: string,
  accountStartDate?: string | null
): boolean {
  if (accountStartDate != null && dateKey < accountStartDate) {
    return false;
  }
  const dayStart = getDayStart(dateKey, userTimezone);
  const availableAt = subHours(dayStart, DAY_AVAILABLE_HOURS_BEFORE);
  return Date.now() >= availableAt.getTime();
}

export function isDayEditable(
  dateKey: string,
  userTimezone: string,
  accountStartDate?: string | null
): boolean {
  if (accountStartDate != null && dateKey < accountStartDate) {
    return false;
  }
  const dayStart = getDayStart(dateKey, userTimezone);
  const dayEnd = getDayEnd(dateKey, userTimezone);
  const editableStart = subHours(dayStart, DAY_AVAILABLE_HOURS_BEFORE);
  const editableEnd = addHours(dayEnd, DAY_LOCK_HOURS_AFTER);
  const now = Date.now();
  return now >= editableStart.getTime() && now <= editableEnd.getTime();
}

export function isDayLocked(dateKey: string, userTimezone: string): boolean {
  const dayEnd = getDayEnd(dateKey, userTimezone);
  const lockAt = addHours(dayEnd, DAY_LOCK_HOURS_AFTER);
  return Date.now() > lockAt.getTime();
}

export function getDayStatus(
  document: DocumentBase | null,
  dateKey: string,
  userTimezone: string
): "open" | "closed" | "auto_closed" | "pending_auto_close" {
  if (document?.status === DocStatus.Closed) {
    return "closed";
  }
  if (document?.status === DocStatus.AutoClosed) {
    return "auto_closed";
  }
  if (isDayLocked(dateKey, userTimezone)) {
    return "pending_auto_close";
  }
  return "open";
}

export function shouldAutoClose(
  document: DocumentBase | null,
  dateKey: string,
  userTimezone: string
): boolean {
  if (!document || document.status !== DocStatus.Open) {
    return false;
  }
  return isDayLocked(dateKey, userTimezone);
}

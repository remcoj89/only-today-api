import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export function getDayStart(dateKey: string, timeZone: string): Date {
  return fromZonedTime(`${dateKey}T00:00:00`, timeZone);
}

export function getDayEnd(dateKey: string, timeZone: string): Date {
  return fromZonedTime(`${dateKey}T23:59:59.999`, timeZone);
}

export function formatDateKey(date: Date, timeZone = "UTC"): string {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

export function parseDateKey(dateKey: string): Date {
  return fromZonedTime(`${dateKey}T00:00:00`, "UTC");
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DocStatus, DocType } from "../../shared";
import {
  getDayStatus,
  isDayAvailable,
  isDayEditable,
  isDayLocked,
  shouldAutoClose
} from "../dayAvailability";

describe("dayAvailability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks day 24h from now as available", () => {
    vi.setSystemTime(new Date("2026-02-02T00:00:00Z"));
    expect(isDayAvailable("2026-02-03", "UTC")).toBe(true);
  });

  it("marks day 25h from now as not available", () => {
    vi.setSystemTime(new Date("2026-02-01T23:00:00Z"));
    expect(isDayAvailable("2026-02-03", "UTC")).toBe(false);
  });

  it("marks today as editable", () => {
    vi.setSystemTime(new Date("2026-02-02T12:00:00Z"));
    expect(isDayEditable("2026-02-02", "UTC")).toBe(true);
  });

  it("marks yesterday as editable", () => {
    vi.setSystemTime(new Date("2026-02-02T12:00:00Z"));
    expect(isDayEditable("2026-02-01", "UTC")).toBe(true);
  });

  it("locks day 3 days ago", () => {
    vi.setSystemTime(new Date("2026-02-05T12:00:00Z"));
    expect(isDayLocked("2026-02-02", "UTC")).toBe(true);
  });

  it("marks day 2 days ahead as not available", () => {
    vi.setSystemTime(new Date("2026-02-02T12:00:00Z"));
    expect(isDayAvailable("2026-02-04", "UTC")).toBe(false);
  });

  it("handles timezone day boundaries", () => {
    vi.setSystemTime(new Date("2026-02-01T23:30:00Z"));
    expect(isDayAvailable("2026-02-02", "Europe/Amsterdam")).toBe(true);
  });

  it("excludes days before account_start_date", () => {
    vi.setSystemTime(new Date("2026-02-03T12:00:00Z"));
    expect(isDayAvailable("2026-02-01", "UTC", "2026-02-02")).toBe(false);
    expect(isDayAvailable("2026-02-02", "UTC", "2026-02-02")).toBe(true);
    expect(isDayEditable("2026-02-01", "UTC", "2026-02-02")).toBe(false);
    expect(isDayEditable("2026-02-02", "UTC", "2026-02-02")).toBe(true);
  });

  it("detects auto-close after 48h", () => {
    vi.setSystemTime(new Date("2026-02-04T12:00:00Z"));
    const document = {
      id: "doc-1",
      userId: "user-1",
      docType: DocType.Day,
      docKey: "2026-02-01",
      schemaVersion: 1,
      status: DocStatus.Open,
      content: {},
      clientUpdatedAt: new Date().toISOString(),
      serverReceivedAt: new Date().toISOString()
    };
    expect(shouldAutoClose(document, "2026-02-01", "UTC")).toBe(true);
    expect(getDayStatus(document, "2026-02-01", "UTC")).toBe("pending_auto_close");
  });
});

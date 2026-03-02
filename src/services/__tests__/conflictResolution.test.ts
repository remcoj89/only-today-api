import { describe, expect, it } from "vitest";
import { DocStatus, DocType } from "../../shared";
import { AppError } from "../../errors";
import { resolveConflict, validateClockSkew } from "../conflictResolution";

const baseDocument = {
  id: "doc-1",
  userId: "user-1",
  docType: DocType.Day,
  docKey: "2026-02-02",
  schemaVersion: 1,
  status: DocStatus.Open,
  content: {},
  clientUpdatedAt: "2026-02-02T10:00:00.000Z",
  serverReceivedAt: "2026-02-02T10:00:00.000Z",
  deviceId: "bbb"
};

describe("conflictResolution", () => {
  it("prefers newer timestamps", () => {
    const incoming = { ...baseDocument, clientUpdatedAt: "2026-02-02T11:00:00.000Z" };
    expect(resolveConflict(baseDocument, incoming).winner).toBe("incoming");
  });

  it("rejects older timestamps", () => {
    const incoming = { ...baseDocument, clientUpdatedAt: "2026-02-02T09:00:00.000Z" };
    expect(resolveConflict(baseDocument, incoming).winner).toBe("existing");
  });

  it("uses deviceId as tiebreaker", () => {
    const incoming = { ...baseDocument, deviceId: "aaa" };
    expect(resolveConflict(baseDocument, incoming).winner).toBe("existing");
  });

  it("accepts clock skew at 10 minutes", () => {
    expect(() =>
      validateClockSkew("2026-02-02T10:10:00.000Z", "2026-02-02T10:00:00.000Z")
    ).not.toThrow();
  });

  it("rejects clock skew at 11 minutes", () => {
    expect(() =>
      validateClockSkew("2026-02-02T10:11:00.000Z", "2026-02-02T10:00:00.000Z")
    ).toThrow(AppError);
  });

  it("includes timestamps in clock skew error", () => {
    try {
      validateClockSkew("2026-02-02T10:11:00.000Z", "2026-02-02T10:00:00.000Z");
    } catch (err) {
      const error = err as AppError;
      expect(error.details).toEqual({
        clientTime: "2026-02-02T10:11:00.000Z",
        serverTime: "2026-02-02T10:00:00.000Z"
      });
    }
  });
});

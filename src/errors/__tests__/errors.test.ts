import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ErrorCode } from "../../shared";
import { AppError } from "../AppError";
import { errorHandler } from "../errorHandler";

describe("AppError", () => {
  it("creates errors from factory methods", () => {
    const unauthorized = AppError.unauthorized();
    const forbidden = AppError.forbidden("Nope");
    const validation = AppError.validationError("Invalid", { field: "missing" });
    const docLocked = AppError.docLocked("2026-01-24");
    const notAvailable = AppError.docNotYetAvailable("2026-01-25");
    const clockSkew = AppError.clockSkewRejected("2026-01-24T10:00:00Z", "2026-01-24T10:05:00Z");
    const rateLimited = AppError.rateLimited();
    const internal = AppError.internal();

    expect(unauthorized.code).toBe(ErrorCode.Unauthorized);
    expect(forbidden.message).toBe("Nope");
    expect(validation.details).toEqual({ field: "missing" });
    expect(docLocked.httpStatus).toBe(423);
    expect(notAvailable.code).toBe(ErrorCode.DocNotYetAvailable);
    expect(clockSkew.code).toBe(ErrorCode.ClockSkewRejected);
    expect(rateLimited.httpStatus).toBe(429);
    expect(internal.httpStatus).toBe(500);
  });
});

describe("errorHandler", () => {
  it("formats AppError responses", async () => {
    const app = express();
    app.get("/validation", (_req, _res) => {
      throw AppError.validationError("Bad payload", { field: "reason" });
    });
    app.use(errorHandler);

    const response = await request(app).get("/validation");
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      code: "VALIDATION_ERROR",
      message: "Bad payload",
      details: { field: "reason" }
    });
  });

  it("hides unexpected error details", async () => {
    const app = express();
    app.get("/boom", () => {
      throw new Error("Sensitive");
    });
    app.use(errorHandler);

    const response = await request(app).get("/boom");
    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      success: false,
      code: "INTERNAL_ERROR",
      message: "Internal server error"
    });
  });
});

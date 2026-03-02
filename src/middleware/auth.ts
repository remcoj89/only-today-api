import type { NextFunction, Request, Response } from "express";
import { config } from "../config";
import { getSupabaseAdminClient, getSupabaseClient } from "../db/client";
import { AppError } from "../errors";
import { getUserFromSession, trackDeviceSession, validateSession } from "../services/sessionService";

type RateLimitEntry = {
  count: number;
  firstFailedAt: number;
};

const failedAuthAttempts = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function getClientIdentifier(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip ?? "unknown";
}

function isLocalhost(identifier: string): boolean {
  return identifier === "127.0.0.1" || identifier === "::1" || identifier === "::ffff:127.0.0.1";
}

function isUnreliableIdentifier(identifier: string): boolean {
  return identifier === "unknown" || identifier === "" || identifier === "undefined";
}

function isExpiredToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      exp?: number;
    };
    if (!payload.exp) {
      return false;
    }
    return payload.exp * 1000 <= Date.now();
  } catch {
    return false;
  }
}

function recordFailure(identifier: string) {
  const existing = failedAuthAttempts.get(identifier);
  const now = Date.now();
  if (!existing || now - existing.firstFailedAt > RATE_LIMIT_WINDOW_MS) {
    failedAuthAttempts.set(identifier, { count: 1, firstFailedAt: now });
    return;
  }
  failedAuthAttempts.set(identifier, { count: existing.count + 1, firstFailedAt: existing.firstFailedAt });
}

function clearFailures(identifier: string) {
  failedAuthAttempts.delete(identifier);
}

function isRateLimited(identifier: string): boolean {
  const entry = failedAuthAttempts.get(identifier);
  if (!entry) {
    return false;
  }
  if (Date.now() - entry.firstFailedAt > RATE_LIMIT_WINDOW_MS) {
    failedAuthAttempts.delete(identifier);
    return false;
  }
  return entry.count >= RATE_LIMIT_MAX;
}

function getDeviceId(req: Request): string | null {
  const headerValue = req.header("x-device-id") ?? req.header("device-id");
  if (!headerValue) {
    return null;
  }
  return headerValue.trim();
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const identifier = getClientIdentifier(req);
  const skipRateLimit =
    isUnreliableIdentifier(identifier) || (config.nodeEnv === "development" && isLocalhost(identifier));
  if (!skipRateLimit && isRateLimited(identifier)) {
    return next(AppError.rateLimited());
  }

  const authHeader = req.header("authorization");
  if (!authHeader) {
    recordFailure(identifier);
    return next(AppError.unauthorized("Missing Authorization header"));
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    recordFailure(identifier);
    return next(AppError.unauthorized("Invalid Authorization header"));
  }

  if (isExpiredToken(token)) {
    recordFailure(identifier);
    return next(AppError.unauthorized("Access token expired"));
  }

  if (!validateSession(token)) {
    recordFailure(identifier);
    return next(AppError.unauthorized("Session revoked"));
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser(token);

  if (error || !data.user) {
    if (error?.status !== 403) {
      recordFailure(identifier);
      return next(AppError.unauthorized());
    }

    const fallbackUser = getUserFromSession(token);
    if (!fallbackUser?.userId) {
      recordFailure(identifier);
      return next(AppError.unauthorized());
    }

    const adminClient = getSupabaseAdminClient();
    const { data: freshUser, error: adminError } = await adminClient.auth.admin.getUserById(
      fallbackUser.userId
    );

    if (adminError || !freshUser?.user) {
      recordFailure(identifier);
      return next(AppError.unauthorized());
    }

    if (freshUser.user.app_metadata?.blocked) {
      recordFailure(identifier);
      return next(AppError.unauthorized("User is blocked"));
    }

    clearFailures(identifier);
    req.userId = freshUser.user.id;
    req.userEmail = freshUser.user.email ?? undefined;
    req.accessToken = token;

    const deviceId = getDeviceId(req);
    if (deviceId) {
      trackDeviceSession(req.userId, deviceId, token);
    }
    return next();
  }

  const adminClient = getSupabaseAdminClient();
  const { data: freshUser, error: adminError } = await adminClient.auth.admin.getUserById(
    data.user.id
  );

  if (adminError || !freshUser?.user) {
    recordFailure(identifier);
    return next(AppError.unauthorized());
  }

  if (freshUser.user.app_metadata?.blocked) {
    recordFailure(identifier);
    return next(AppError.unauthorized("User is blocked"));
  }

  clearFailures(identifier);
  req.userId = freshUser.user.id;
  req.userEmail = freshUser.user.email ?? undefined;
  req.accessToken = token;

  const deviceId = getDeviceId(req);
  if (deviceId) {
    trackDeviceSession(req.userId, deviceId, token);
  }
  return next();
}

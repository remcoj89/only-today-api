import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors";

function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function adminAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const adminEmails = getAdminEmails();
  if (!req.userEmail || adminEmails.length === 0) {
    return next(AppError.forbidden("Admin access required"));
  }

  const isAdmin = adminEmails.includes(req.userEmail.toLowerCase());
  if (!isAdmin) {
    return next(AppError.forbidden("Admin access required"));
  }

  return next();
}

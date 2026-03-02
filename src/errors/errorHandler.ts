import type { NextFunction, Request, Response } from "express";
import { ErrorCode } from "../shared";
import { AppError } from "./AppError";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (err instanceof AppError) {
    const payload = {
      success: false,
      code: err.code,
      message: err.message,
      details: err.details
    };
    if (!payload.details) {
      delete payload.details;
    }
    return res.status(err.httpStatus).json(payload);
  }

  console.error(err);

  return res.status(500).json({
    success: false,
    code: ErrorCode.InternalError,
    message: "Internal server error"
  });
}

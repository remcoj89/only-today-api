import { ErrorCode } from "../shared";

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly httpStatus: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    httpStatus: number,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(ErrorCode.Unauthorized, message, 401);
  }

  static forbidden(message = "Forbidden") {
    return new AppError(ErrorCode.Forbidden, message, 403);
  }

  static validationError(message: string, details: Record<string, unknown>) {
    return new AppError(ErrorCode.ValidationError, message, 400, details);
  }

  static docLocked(docKey: string) {
    return new AppError(
      ErrorCode.DocLocked,
      `Document ${docKey} is locked`,
      423
    );
  }

  static docNotYetAvailable(docKey: string) {
    return new AppError(
      ErrorCode.DocNotYetAvailable,
      `Document ${docKey} is not yet available`,
      409
    );
  }

  static clockSkewRejected(clientTime: string, serverTime: string) {
    return new AppError(
      ErrorCode.ClockSkewRejected,
      `Client time ${clientTime} differs from server time ${serverTime}`,
      409,
      { clientTime, serverTime }
    );
  }

  static rateLimited(message = "Too many requests") {
    return new AppError(ErrorCode.RateLimited, message, 429);
  }

  static internal(message = "Internal server error") {
    return new AppError(ErrorCode.InternalError, message, 500);
  }
}

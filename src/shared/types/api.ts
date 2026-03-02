export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: ApiError;
};

export type ApiError = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export enum ErrorCode {
  Unauthorized = "UNAUTHORIZED",
  Forbidden = "FORBIDDEN",
  ValidationError = "VALIDATION_ERROR",
  DocLocked = "DOC_LOCKED",
  DocNotYetAvailable = "DOC_NOT_YET_AVAILABLE",
  ClockSkewRejected = "CLOCK_SKEW_REJECTED",
  SyncConflictResolvedLww = "SYNC_CONFLICT_RESOLVED_LWW",
  RateLimited = "RATE_LIMITED",
  InternalError = "INTERNAL_ERROR"
}

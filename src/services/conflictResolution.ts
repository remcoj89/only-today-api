import { CLOCK_SKEW_MAX_MINUTES, type DocumentBase } from "../shared";
import { AppError } from "../errors";

export type ConflictResolutionResult = {
  winner: "incoming" | "existing";
};

export function resolveConflict(
  existing: DocumentBase,
  incoming: DocumentBase
): ConflictResolutionResult {
  const existingTime = new Date(existing.clientUpdatedAt).getTime();
  const incomingTime = new Date(incoming.clientUpdatedAt).getTime();

  if (incomingTime > existingTime) {
    return { winner: "incoming" };
  }
  if (incomingTime < existingTime) {
    return { winner: "existing" };
  }

  const existingDevice = existing.deviceId ?? "";
  const incomingDevice = incoming.deviceId ?? "";
  if (incomingDevice.localeCompare(existingDevice) > 0) {
    return { winner: "incoming" };
  }
  return { winner: "existing" };
}

export function validateClockSkew(clientUpdatedAt: string, serverReceivedAt: string) {
  const clientTime = new Date(clientUpdatedAt).getTime();
  const serverTime = new Date(serverReceivedAt).getTime();
  const maxSkewMs = CLOCK_SKEW_MAX_MINUTES * 60 * 1000;

  if (clientTime > serverTime + maxSkewMs) {
    throw AppError.clockSkewRejected(clientUpdatedAt, serverReceivedAt);
  }
}

import type { SyncMutationResult } from "../types/sync";

export type ConflictHandler = (conflicts: SyncMutationResult[]) => void;

export function extractConflicts(results: SyncMutationResult[]): SyncMutationResult[] {
  return results.filter((result) => !!result.conflictResolution);
}

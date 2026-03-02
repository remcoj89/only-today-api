import { ApiError } from "./api";
import { DocType, DocumentBase } from "./documents";

export type SyncMutationOperation = "upsert" | "delete";

export interface SyncMutation {
  id: string;
  docType: DocType;
  docKey: string;
  content: Record<string, unknown>;
  clientUpdatedAt: string;
  deviceId: string;
  operation: SyncMutationOperation;
}

export interface SyncPushRequest {
  mutations: SyncMutation[];
}

export interface SyncMutationConflict {
  winner: "incoming" | "existing";
  document?: DocumentBase;
}

export interface SyncMutationResult {
  id: string;
  success: boolean;
  error?: ApiError;
  conflictResolution?: SyncMutationConflict;
}

export interface SyncPushResponse {
  results: SyncMutationResult[];
}

export interface SyncPullRequest {
  since: string;
  docTypes?: DocType[];
}

export interface SyncPullResponse {
  documents: DocumentBase[];
  serverTime: string;
}

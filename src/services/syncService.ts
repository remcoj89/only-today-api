import { createClient } from "@supabase/supabase-js";
import {
  ErrorCode,
  type ApiError,
  type DocType,
  type DocumentBase,
  type SyncMutation,
  type SyncMutationResult
} from "../shared";
import { config } from "../config";
import { AppError } from "../errors";
import { saveDocument } from "./documentService";

type SyncPullResult = {
  documents: DocumentBase[];
  serverTime: string;
};

function createAuthedClient(accessToken: string) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

function toApiError(err: unknown): ApiError {
  if (err instanceof AppError) {
    return {
      code: err.code,
      message: err.message,
      details: err.details
    };
  }
  return {
    code: ErrorCode.InternalError,
    message: "Internal server error"
  };
}

async function deleteDocumentByKey(
  userId: string,
  accessToken: string,
  docType: DocType,
  docKey: string
): Promise<void> {
  const client = createAuthedClient(accessToken);
  const { error } = await client
    .from("journal_documents")
    .delete()
    .eq("user_id", userId)
    .eq("doc_type", docType)
    .eq("doc_key", docKey);
  if (error) {
    throw AppError.internal(error.message);
  }
}

export async function processPushMutations(
  userId: string,
  accessToken: string,
  mutations: SyncMutation[]
): Promise<SyncMutationResult[]> {
  const results: SyncMutationResult[] = [];

  for (const mutation of mutations) {
    try {
      if (mutation.operation === "delete") {
        await deleteDocumentByKey(userId, accessToken, mutation.docType, mutation.docKey);
        results.push({ id: mutation.id, success: true });
        continue;
      }

      const saveResult = await saveDocument(
        userId,
        accessToken,
        mutation.docType,
        mutation.docKey,
        mutation.content,
        mutation.clientUpdatedAt,
        mutation.deviceId
      );
      results.push({
        id: mutation.id,
        success: true,
        conflictResolution: saveResult.conflictResolution
          ? { winner: saveResult.conflictResolution.winner, document: saveResult.document }
          : undefined
      });
    } catch (err) {
      results.push({
        id: mutation.id,
        success: false,
        error: toApiError(err)
      });
    }
  }

  return results;
}

export async function getChangedDocuments(
  userId: string,
  accessToken: string,
  since: string,
  docTypes?: DocType[],
  limit?: number
): Promise<SyncPullResult> {
  const client = createAuthedClient(accessToken);
  let query = client
    .from("journal_documents")
    .select("*")
    .eq("user_id", userId)
    .gte("server_received_at", since)
    .order("server_received_at", { ascending: true });

  if (docTypes && docTypes.length > 0) {
    query = query.in("doc_type", docTypes);
  }
  if (limit !== undefined) {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error) {
    throw AppError.internal(error.message);
  }

  const documents = (data ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    docType: row.doc_type as DocType,
    docKey: row.doc_key,
    schemaVersion: row.schema_version,
    status: row.status,
    content: row.content,
    clientUpdatedAt: row.client_updated_at,
    serverReceivedAt: row.server_received_at,
    deviceId: row.device_id ?? undefined
  }));

  return {
    documents,
    serverTime: new Date().toISOString()
  };
}

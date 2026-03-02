import { createClient } from "@supabase/supabase-js";
import type { DocumentBase, DocType } from "../shared";
import { config } from "../config";
import { AppError } from "../errors";
import type {
  DocumentCreateInput,
  DocumentQueryOptions,
  DocumentRepository,
  DocumentUpdateInput
} from "../types/repository";

type JournalDocumentRow = {
  id: string;
  user_id: string;
  doc_type: string;
  doc_key: string;
  schema_version: number;
  status: string;
  content: Record<string, unknown>;
  client_updated_at: string;
  server_received_at: string;
  device_id: string | null;
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

function mapRow(row: JournalDocumentRow): DocumentBase {
  return {
    id: row.id,
    userId: row.user_id,
    docType: row.doc_type as DocType,
    docKey: row.doc_key,
    schemaVersion: row.schema_version,
    status: row.status as DocumentBase["status"],
    content: row.content,
    clientUpdatedAt: row.client_updated_at,
    serverReceivedAt: row.server_received_at,
    deviceId: row.device_id ?? undefined
  };
}

function toCreateRow(input: DocumentCreateInput): Omit<JournalDocumentRow, "id" | "server_received_at"> & {
  server_received_at: string;
} {
  return {
    user_id: input.userId,
    doc_type: input.docType,
    doc_key: input.docKey,
    schema_version: input.schemaVersion ?? 1,
    status: input.status,
    content: input.content,
    client_updated_at: input.clientUpdatedAt,
    server_received_at: new Date().toISOString(),
    device_id: input.deviceId ?? null
  };
}

function toUpdateRow(updates: DocumentUpdateInput): Partial<JournalDocumentRow> {
  const row: Partial<JournalDocumentRow> = {};
  if (updates.schemaVersion !== undefined) {
    row.schema_version = updates.schemaVersion;
  }
  if (updates.status !== undefined) {
    row.status = updates.status;
  }
  if (updates.content !== undefined) {
    row.content = updates.content;
  }
  if (updates.clientUpdatedAt !== undefined) {
    row.client_updated_at = updates.clientUpdatedAt;
  }
  if (updates.deviceId !== undefined) {
    row.device_id = updates.deviceId;
  }
  row.server_received_at = new Date().toISOString();
  return row;
}

export function createDocumentRepository(accessToken: string): DocumentRepository {
  const client = createAuthedClient(accessToken);

  return {
    async findById(id) {
      const { data, error } = await client.from("journal_documents").select("*").eq("id", id).maybeSingle();
      if (error) {
        throw AppError.internal(error.message);
      }
      return data ? mapRow(data as JournalDocumentRow) : null;
    },

    async findByKey(userId, docType, docKey) {
      const { data, error } = await client
        .from("journal_documents")
        .select("*")
        .eq("user_id", userId)
        .eq("doc_type", docType)
        .eq("doc_key", docKey)
        .maybeSingle();
      if (error) {
        throw AppError.internal(error.message);
      }
      return data ? mapRow(data as JournalDocumentRow) : null;
    },

    async findByUser(userId, options) {
      let query = client.from("journal_documents").select("*").eq("user_id", userId);

      if (options?.docType) {
        query = query.eq("doc_type", options.docType);
      }
      if (options?.since) {
        query = query.gte("server_received_at", options.since);
      }
      if (options?.order) {
        query = query.order("server_received_at", { ascending: options.order === "asc" });
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;
      if (error) {
        throw AppError.internal(error.message);
      }
      return (data ?? []).map((row) => mapRow(row as JournalDocumentRow));
    },

    async create(document) {
      const { data, error } = await client
        .from("journal_documents")
        .insert(toCreateRow(document))
        .select("*")
        .single();
      if (error || !data) {
        throw AppError.internal(error?.message ?? "Failed to create document");
      }
      return mapRow(data as JournalDocumentRow);
    },

    async update(id, updates) {
      const { data, error } = await client
        .from("journal_documents")
        .update(toUpdateRow(updates))
        .eq("id", id)
        .select("*")
        .single();
      if (error || !data) {
        throw AppError.internal(error?.message ?? "Failed to update document");
      }
      return mapRow(data as JournalDocumentRow);
    },

    async upsert(document) {
      const { data, error } = await client
        .from("journal_documents")
        .upsert(toCreateRow(document), { onConflict: "user_id,doc_type,doc_key" })
        .select("*")
        .single();
      if (error || !data) {
        throw AppError.internal(error?.message ?? "Failed to upsert document");
      }
      return mapRow(data as JournalDocumentRow);
    }
  };
}

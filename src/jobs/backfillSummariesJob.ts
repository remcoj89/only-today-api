import { DocType, type DocumentBase } from "../shared";
import { getSupabaseAdminClient } from "../db/client";
import { updateSummary } from "../services/statusSummaryService";

type JournalDocumentRow = {
  id: string;
  user_id: string;
  doc_type: string;
  doc_key: string;
  status: string;
  content: Record<string, unknown>;
  client_updated_at: string;
  server_received_at: string;
  device_id: string | null;
};

function toDocumentBase(row: JournalDocumentRow): DocumentBase {
  return {
    id: row.id,
    userId: row.user_id,
    docType: row.doc_type as DocType,
    docKey: row.doc_key,
    schemaVersion: 1,
    status: row.status as DocumentBase["status"],
    content: row.content,
    clientUpdatedAt: row.client_updated_at,
    serverReceivedAt: row.server_received_at,
    deviceId: row.device_id ?? undefined
  };
}

/**
 * Backfills daily_status_summary for all day documents.
 * Ensures closed days have a summary row so buddy status is visible.
 */
export async function runBackfillSummariesJob(): Promise<number> {
  const admin = getSupabaseAdminClient();
  const { data: rows, error } = await admin
    .from("journal_documents")
    .select("id,user_id,doc_type,doc_key,status,content,client_updated_at,server_received_at,device_id")
    .eq("doc_type", DocType.Day);

  if (error) {
    throw new Error(`Failed to load day documents for backfill: ${error.message}`);
  }

  const documents = (rows ?? []) as JournalDocumentRow[];
  let updatedCount = 0;

  for (const row of documents) {
    const document = toDocumentBase(row);
    await updateSummary(document.userId, document.docKey, document);
    updatedCount += 1;
  }

  return updatedCount;
}

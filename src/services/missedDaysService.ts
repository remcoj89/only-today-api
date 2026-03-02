import { createClient } from "@supabase/supabase-js";
import { subDays } from "date-fns";
import type { DayContent, DocumentBase } from "../shared";
import { DocType } from "../shared";
import { config } from "../config";
import { getSupabaseAdminClient } from "../db/client";
import { AppError } from "../errors";
import { formatDateKey } from "../utils/dateUtils";
import { isDayLocked } from "./dayAvailability";

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

async function loadUserTimezone(userId: string, accessToken?: string): Promise<string> {
  const client = accessToken ? createAuthedClient(accessToken) : getSupabaseAdminClient();
  const { data, error } = await client
    .from("user_settings")
    .select("timezone")
    .eq("user_id", userId)
    .single();
  if (error) {
    throw AppError.internal("Failed to load user settings");
  }
  return data?.timezone ?? "UTC";
}

async function loadDayDocuments(userId: string, accessToken?: string): Promise<DocumentBase[]> {
  const client = accessToken ? createAuthedClient(accessToken) : getSupabaseAdminClient();
  const { data, error } = await client
    .from("journal_documents")
    .select("*")
    .eq("user_id", userId)
    .eq("doc_type", DocType.Day);
  if (error) {
    throw AppError.internal("Failed to load day documents");
  }
  return (data ?? []).map((row) => mapRow(row as JournalDocumentRow));
}

function hasCompleteReflection(reflection?: DayContent["dayClose"]["reflection"]) {
  if (!reflection) {
    return false;
  }
  return (
    reflection.wentWell.length > 0 &&
    reflection.whyWentWell.length > 0 &&
    reflection.repeatInFuture.length > 0 &&
    reflection.wentWrong.length > 0 &&
    reflection.whyWentWrong.length > 0 &&
    reflection.doDifferently.length > 0
  );
}

export function isMissedDay(document: DocumentBase, timeZone: string): boolean {
  if (document.docType !== DocType.Day) {
    return false;
  }
  if (document.status === "closed") {
    return false;
  }
  if (!isDayLocked(document.docKey, timeZone)) {
    return false;
  }
  const content = document.content as Partial<DayContent>;
  const reflection = content.dayClose?.reflection;
  return !hasCompleteReflection(reflection);
}

export async function getMissedDays(userId: string, limit = 30, accessToken?: string) {
  const timeZone = await loadUserTimezone(userId, accessToken);
  const documents = await loadDayDocuments(userId, accessToken);
  const missed = documents
    .filter((document) => isMissedDay(document, timeZone))
    .map((document) => document.docKey)
    .sort()
    .reverse();
  return missed.slice(0, limit);
}

export async function getConsecutiveMissedCount(userId: string, accessToken?: string): Promise<number> {
  const timeZone = await loadUserTimezone(userId, accessToken);
  const documents = await loadDayDocuments(userId, accessToken);
  const missedMap = new Map(
    documents.map((document) => [document.docKey, isMissedDay(document, timeZone)])
  );

  let startOffset = 0;
  while (startOffset < 7) {
    const candidate = formatDateKey(subDays(new Date(), startOffset), timeZone);
    if (isDayLocked(candidate, timeZone)) {
      break;
    }
    startOffset += 1;
  }

  let count = 0;
  for (let offset = startOffset; offset < 365; offset += 1) {
    const dateKey = formatDateKey(subDays(new Date(), offset), timeZone);
    if (!missedMap.get(dateKey)) {
      break;
    }
    count += 1;
  }
  return count;
}

import type { DocType, DocumentBase } from "../shared";

export type DocumentQueryOptions = {
  docType?: DocType;
  since?: string;
  limit?: number;
  order?: "asc" | "desc";
};

export type DocumentCreateInput = {
  userId: string;
  docType: DocType;
  docKey: string;
  schemaVersion?: number;
  status: DocumentBase["status"];
  content: Record<string, unknown>;
  clientUpdatedAt: string;
  deviceId?: string;
};

export type DocumentUpdateInput = {
  schemaVersion?: number;
  status?: DocumentBase["status"];
  content?: Record<string, unknown>;
  clientUpdatedAt?: string;
  deviceId?: string | null;
};

export interface DocumentRepository {
  findById: (id: string) => Promise<DocumentBase | null>;
  findByKey: (userId: string, docType: DocType, docKey: string) => Promise<DocumentBase | null>;
  findByUser: (userId: string, options?: DocumentQueryOptions) => Promise<DocumentBase[]>;
  create: (document: DocumentCreateInput) => Promise<DocumentBase>;
  update: (id: string, updates: DocumentUpdateInput) => Promise<DocumentBase>;
  upsert: (document: DocumentCreateInput) => Promise<DocumentBase>;
}

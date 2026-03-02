import { z } from "zod";
import { DocType } from "../shared";

const isoDateTime = z.string().datetime();

export const syncMutationSchema = z.object({
  id: z.string().min(1),
  docType: z.nativeEnum(DocType),
  docKey: z.string().min(1),
  content: z.record(z.unknown()),
  clientUpdatedAt: isoDateTime,
  deviceId: z.string().min(1),
  operation: z.enum(["upsert", "delete"])
});

export const syncPushSchema = z.object({
  mutations: z.array(syncMutationSchema)
});

export const syncPullQuerySchema = z.object({
  since: isoDateTime,
  docTypes: z.string().optional()
});

export const syncFullSchema = z.object({
  push: syncPushSchema,
  pullSince: isoDateTime
});

import { type IRouter, Router } from "express";
import { DocType, type DayContent } from "../shared";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import {
  closeDaySchema,
  documentListQuerySchema,
  documentParamsSchema,
  documentUpdateSchema
} from "../schemas/documents";
import { closeDay, getDocument, listDocuments, saveDocument } from "../services/documentService";

export const documentRoutes: IRouter = Router();

documentRoutes.get(
  "/:docType/:docKey",
  validateRequest({ params: documentParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { docType, docKey } = req.params as { docType: DocType; docKey: string };
      const document = await getDocument(req.userId, req.accessToken, docType, docKey);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

documentRoutes.put(
  "/:docType/:docKey",
  validateRequest({ params: documentParamsSchema, body: documentUpdateSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { docType, docKey } = req.params as { docType: DocType; docKey: string };
      const { content, clientUpdatedAt, deviceId, status } = req.body as {
        content: Record<string, unknown>;
        clientUpdatedAt: string;
        deviceId?: string;
        status?: "open" | "closed" | "auto_closed";
      };
      const result = await saveDocument(
        req.userId,
        req.accessToken,
        docType,
        docKey,
        content,
        clientUpdatedAt,
        deviceId,
        status
      );
      const data: Record<string, unknown> = { document: result.document };
      if (result.conflictResolution) {
        data.conflictResolution = result.conflictResolution;
      }
      return res.status(200).json({ success: true, data });
    } catch (err) {
      return next(err as Error);
    }
  }
);

documentRoutes.post(
  "/:docType/:docKey/close",
  validateRequest({ params: documentParamsSchema, body: closeDaySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { docType, docKey } = req.params as { docType: DocType; docKey: string };
      if (docType !== DocType.Day) {
        return next(AppError.validationError("Only day documents can be closed", { docType }));
      }
      const { reflection } = req.body as { reflection: DayContent["dayClose"]["reflection"] };
      const document = await closeDay(req.userId, req.accessToken, docKey, reflection);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

documentRoutes.get(
  "/",
  validateRequest({ query: documentListQuerySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { docType, since } = req.query as { docType?: DocType; since?: string };
      const documents = await listDocuments(req.userId, req.accessToken, { docType, since });
      return res.status(200).json({ success: true, data: { documents } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

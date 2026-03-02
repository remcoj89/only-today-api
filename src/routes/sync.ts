import { Router } from "express";
import { DocType } from "../shared";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import { syncFullSchema, syncPullQuerySchema, syncPushSchema } from "../schemas/sync";
import { getChangedDocuments, processPushMutations } from "../services/syncService";

export const syncRoutes = Router();

const MAX_PUSH_MUTATIONS = 100;
const MAX_PULL_DOCUMENTS = 1000;

function parseDocTypes(value?: string): DocType[] | undefined {
  if (!value) {
    return undefined;
  }
  const requested = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const docTypes = requested.map((entry) => {
    if (!Object.values(DocType).includes(entry as DocType)) {
      throw AppError.validationError("Invalid doc type filter", { docType: entry });
    }
    return entry as DocType;
  });

  return docTypes.length > 0 ? docTypes : undefined;
}

syncRoutes.post("/push", validateRequest({ body: syncPushSchema }), async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const { mutations } = req.body as { mutations: unknown[] };
    if (mutations.length > MAX_PUSH_MUTATIONS) {
      return next(AppError.rateLimited("Too many mutations in push request"));
    }
    const results = await processPushMutations(req.userId, req.accessToken, req.body.mutations);
    return res.status(200).json({ success: true, data: { results } });
  } catch (err) {
    return next(err as Error);
  }
});

syncRoutes.get("/pull", validateRequest({ query: syncPullQuerySchema }), async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const { since, docTypes } = req.query as { since: string; docTypes?: string };
    const parsedDocTypes = parseDocTypes(docTypes);
    const pull = await getChangedDocuments(
      req.userId,
      req.accessToken,
      since,
      parsedDocTypes,
      MAX_PULL_DOCUMENTS
    );
    return res.status(200).json({ success: true, data: pull });
  } catch (err) {
    return next(err as Error);
  }
});

syncRoutes.post("/full", validateRequest({ body: syncFullSchema }), async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const { push, pullSince } = req.body as { push: { mutations: unknown[] }; pullSince: string };
    if (push.mutations.length > MAX_PUSH_MUTATIONS) {
      return next(AppError.rateLimited("Too many mutations in push request"));
    }
    const results = await processPushMutations(req.userId, req.accessToken, push.mutations);
    const pull = await getChangedDocuments(
      req.userId,
      req.accessToken,
      pullSince,
      undefined,
      MAX_PULL_DOCUMENTS
    );
    return res.status(200).json({ success: true, data: { push: { results }, pull } });
  } catch (err) {
    return next(err as Error);
  }
});

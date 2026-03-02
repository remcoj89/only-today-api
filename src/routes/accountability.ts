import { Router } from "express";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import {
  checkinBodySchema,
  dateRangeQuerySchema,
  pairRequestBodySchema,
  requestIdParamsSchema
} from "../schemas/accountability";
import {
  acceptPairRequest,
  createCheckin,
  createPairRequest,
  getCheckins,
  getPartner,
  getPartnerSummary,
  listPairRequests,
  rejectPairRequest,
  removePair
} from "../services/accountabilityService";

export const accountabilityRoutes = Router();

accountabilityRoutes.post(
  "/request",
  validateRequest({ body: pairRequestBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const result = await createPairRequest(req.userId, req.accessToken, req.body.toUserEmail, req.body.toUserId);
      return res.status(200).json({ success: true, data: { request: result } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

accountabilityRoutes.get("/requests", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const requests = await listPairRequests(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { requests } });
  } catch (err) {
    return next(err as Error);
  }
});

accountabilityRoutes.post(
  "/requests/:id/accept",
  validateRequest({ params: requestIdParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { id } = req.params as { id: string };
      const result = await acceptPairRequest(req.userId, req.accessToken, id);
      return res.status(200).json({ success: true, data: { pair: result } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

accountabilityRoutes.post(
  "/requests/:id/reject",
  validateRequest({ params: requestIdParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { id } = req.params as { id: string };
      const result = await rejectPairRequest(req.userId, req.accessToken, id);
      return res.status(200).json({ success: true, data: result });
    } catch (err) {
      return next(err as Error);
    }
  }
);

accountabilityRoutes.delete("/pair", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const result = await removePair(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    return next(err as Error);
  }
});

accountabilityRoutes.get("/partner", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const partner = await getPartner(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { partner } });
  } catch (err) {
    return next(err as Error);
  }
});

accountabilityRoutes.get(
  "/partner/summary",
  validateRequest({ query: dateRangeQuerySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { startDate, endDate } = req.query as { startDate: string; endDate: string };
      const summary = await getPartnerSummary(req.userId, req.accessToken, { startDate, endDate });
      return res.status(200).json({ success: true, data: { summary } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

accountabilityRoutes.post(
  "/checkin",
  validateRequest({ body: checkinBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const checkin = await createCheckin(req.userId, req.accessToken, req.body.message);
      return res.status(200).json({ success: true, data: { checkin } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

accountabilityRoutes.get(
  "/checkins",
  validateRequest({ query: dateRangeQuerySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { startDate, endDate } = req.query as { startDate: string; endDate: string };
      const checkins = await getCheckins(req.userId, req.accessToken, { startDate, endDate });
      return res.status(200).json({ success: true, data: { checkins } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

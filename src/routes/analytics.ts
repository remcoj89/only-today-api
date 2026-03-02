import { Router } from "express";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import { analyticsDateRangeSchema, analyticsYearSchema } from "../schemas/analytics";
import {
  getCalendarHeatmap,
  getCorrelations,
  getCurrentStreaks,
  getDayClosedRate,
  getDayCloseAdherence,
  getDayStartAdherence,
  getLifePillarAdherence,
  getPomodoroUtilization
} from "../services/analyticsService";

export const analyticsRoutes = Router();

analyticsRoutes.get(
  "/completion-rates",
  validateRequest({ query: analyticsDateRangeSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { startDate, endDate } = req.query as { startDate: string; endDate: string };
      const range = { startDate, endDate };
      const dayClosedRate = await getDayClosedRate(req.userId, req.accessToken, range);
      const dayStartAdherence = await getDayStartAdherence(req.userId, req.accessToken, range);
      const dayCloseAdherence = await getDayCloseAdherence(req.userId, req.accessToken, range);
      const lifePillarAdherence = await getLifePillarAdherence(req.userId, req.accessToken, range);
      return res.status(200).json({
        success: true,
        data: {
          dayClosedRate,
          dayStartAdherence,
          dayCloseAdherence,
          lifePillarAdherence
        }
      });
    } catch (err) {
      return next(err as Error);
    }
  }
);

analyticsRoutes.get(
  "/pomodoro-stats",
  validateRequest({ query: analyticsDateRangeSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { startDate, endDate } = req.query as { startDate: string; endDate: string };
      const stats = await getPomodoroUtilization(req.userId, req.accessToken, { startDate, endDate });
      return res.status(200).json({ success: true, data: { stats } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

analyticsRoutes.get("/streaks", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const streaks = await getCurrentStreaks(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { streaks } });
  } catch (err) {
    return next(err as Error);
  }
});

analyticsRoutes.get(
  "/correlations",
  validateRequest({ query: analyticsDateRangeSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { startDate, endDate } = req.query as { startDate: string; endDate: string };
      const correlations = await getCorrelations(req.userId, req.accessToken, { startDate, endDate });
      return res.status(200).json({ success: true, data: { correlations } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

analyticsRoutes.get(
  "/calendar-heatmap",
  validateRequest({ query: analyticsYearSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { year } = req.query as { year: string };
      const data = await getCalendarHeatmap(req.userId, req.accessToken, Number(year));
      return res.status(200).json({ success: true, data: { data } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

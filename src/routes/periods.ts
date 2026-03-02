import { type IRouter, Router } from "express";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import {
  goalProgressParamsSchema,
  lifeWheelUpdateSchema,
  monthGoalsSchema,
  monthStartSchema,
  periodKeyParamsSchema,
  progressUpdateSchema,
  quarterGoalsSchema,
  quarterStartSchema,
  relatedGoalParamsSchema,
  weekGoalsSchema,
  weekStartSchema
} from "../schemas/periods";
import {
  createMonthStart,
  createQuarterStart,
  createWeekStart,
  getCurrentMonth,
  getCurrentQuarter,
  getCurrentWeek,
  getWeekKey,
  setMonthlyGoals,
  setQuarterGoals,
  setWeeklyGoals,
  updateLifeWheel,
  updateMonthGoalProgress,
  updateQuarterGoalProgress,
  updateWeekGoalProgress
} from "../services/periodService";
import { periodServiceUtils } from "../services/periodService";
import { getGoalHierarchy, getPeriodProgress } from "../services/periodHierarchy";
import { formatDateKey } from "../utils/dateUtils";
import { getUserSettings, setAccountStartDateIfUnset } from "../services/userService";

export const periodRoutes: IRouter = Router();

periodRoutes.post(
  "/quarter/start",
  validateRequest({ body: quarterStartSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { startDate } = req.body as { startDate: string };
      const document = await createQuarterStart(req.userId, req.accessToken, startDate);
      const settings = await getUserSettings(req.userId, req.accessToken);
      const todayKey = formatDateKey(new Date(), settings.timezone ?? "UTC");
      await setAccountStartDateIfUnset(req.userId, req.accessToken, todayKey);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.get("/quarter/current", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const document = await getCurrentQuarter(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { document } });
  } catch (err) {
    return next(err as Error);
  }
});

periodRoutes.patch(
  "/quarter/:key/life-wheel",
  validateRequest({ params: periodKeyParamsSchema, body: lifeWheelUpdateSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { key } = req.params as unknown as { key: string };
      const document = await updateLifeWheel(req.userId, req.accessToken, key, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.put(
  "/quarter/:key/goals",
  validateRequest({ params: periodKeyParamsSchema, body: quarterGoalsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { key } = req.params as unknown as { key: string };
      const { goals } = req.body as { goals: Parameters<typeof setQuarterGoals>[3] };
      const document = await setQuarterGoals(req.userId, req.accessToken, key, goals);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.patch(
  "/quarter/:key/goals/:index/progress",
  validateRequest({ params: goalProgressParamsSchema, body: progressUpdateSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { key, index } = req.params as unknown as { key: string; index: number };
      const { progress } = req.body as { progress: number };
      const document = await updateQuarterGoalProgress(req.userId, req.accessToken, key, index, progress);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.post(
  "/month/start",
  validateRequest({ body: monthStartSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { monthKey } = req.body as { monthKey: string };
      const document = await createMonthStart(req.userId, req.accessToken, monthKey);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.get("/month/current", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const document = await getCurrentMonth(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { document } });
  } catch (err) {
    return next(err as Error);
  }
});

periodRoutes.put(
  "/month/:key/goals",
  validateRequest({ params: periodKeyParamsSchema, body: monthGoalsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { key } = req.params as unknown as { key: string };
      const { goals } = req.body as { goals: Parameters<typeof setMonthlyGoals>[3] };
      const document = await setMonthlyGoals(req.userId, req.accessToken, key, goals);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.patch(
  "/month/:key/goals/:index/progress",
  validateRequest({ params: goalProgressParamsSchema, body: progressUpdateSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { key, index } = req.params as unknown as { key: string; index: number };
      const { progress } = req.body as { progress: number };
      const document = await updateMonthGoalProgress(req.userId, req.accessToken, key, index, progress);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.post(
  "/week/start",
  validateRequest({ body: weekStartSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { weekKey } = req.body as { weekKey: string };
      const document = await createWeekStart(req.userId, req.accessToken, weekKey);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.get("/week/current", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const document = await getCurrentWeek(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { document } });
  } catch (err) {
    return next(err as Error);
  }
});

periodRoutes.put(
  "/week/:key/goals",
  validateRequest({ params: periodKeyParamsSchema, body: weekGoalsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { key } = req.params as unknown as { key: string };
      const { goals } = req.body as { goals: Parameters<typeof setWeeklyGoals>[3] };
      const document = await setWeeklyGoals(req.userId, req.accessToken, key, goals);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.patch(
  "/week/:key/goals/:index/progress",
  validateRequest({ params: goalProgressParamsSchema, body: progressUpdateSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { key, index } = req.params as unknown as { key: string; index: number };
      const { progress } = req.body as { progress: number };
      const document = await updateWeekGoalProgress(req.userId, req.accessToken, key, index, progress);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

periodRoutes.get("/hierarchy", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const quarter = await getCurrentQuarter(req.userId, req.accessToken);
    const now = new Date();
    const monthKey = periodServiceUtils.getMonthKey(now);
    const weekKey = getWeekKey(now);
    let month = await getCurrentMonth(req.userId, req.accessToken).catch(() => null);
    if (!month) {
      month = await createMonthStart(req.userId, req.accessToken, monthKey);
    }
    let week = await getCurrentWeek(req.userId, req.accessToken).catch(() => null);
    if (!week) {
      week = await createWeekStart(req.userId, req.accessToken, weekKey);
    }
    return res.status(200).json({ success: true, data: { quarter, month, week } });
  } catch (err) {
    return next(err as Error);
  }
});

periodRoutes.get("/progress", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }
    const progress = await getPeriodProgress(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { progress } });
  } catch (err) {
    return next(err as Error);
  }
});

periodRoutes.get(
  "/goals/:type/:index/related",
  validateRequest({ params: relatedGoalParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { type, index } = req.params as unknown as { type: "week"; index: number };
      if (type !== "week") {
        return next(AppError.validationError("Unsupported goal type", { type }));
      }
      const hierarchy = await getGoalHierarchy(req.userId, req.accessToken, index);
      return res.status(200).json({ success: true, data: { hierarchy } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

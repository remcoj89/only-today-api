import { Router } from "express";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import {
  dayCloseChecklistSchema,
  dayParamsSchema,
  dayStartBodySchema,
  lifePillarsUpdateSchema,
  oneThingBodySchema,
  otherTaskBodySchema,
  pomodoroSessionParamsSchema,
  pomodoroStartSchema,
  reflectionBodySchema,
  topThreeBodySchema
} from "../schemas/days";
import {
  addOtherTask,
  closeDay,
  completeDayStart,
  getDayCloseStatus,
  getDayStartStatus,
  getLifePillarsStatus,
  getPlanningStatus,
  setOneThing,
  setTopThree,
  submitReflection,
  updateDayCloseChecklist,
  updateLifePillars
} from "../services/dayWorkflowService";
import {
  completePomodoro,
  getPomodoroProgress,
  startBreak,
  startPomodoro
} from "../services/pomodoroService";

export const dayRoutes = Router();

dayRoutes.get(
  "/:dateKey/start/status",
  validateRequest({ params: dayParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const status = await getDayStartStatus(req.userId, req.accessToken, dateKey);
      return res.status(200).json({ success: true, data: { status } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.post(
  "/:dateKey/start",
  validateRequest({ params: dayParamsSchema, body: dayStartBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await completeDayStart(req.userId, req.accessToken, dateKey, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.get(
  "/:dateKey/planning/status",
  validateRequest({ params: dayParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const status = await getPlanningStatus(req.userId, req.accessToken, dateKey);
      return res.status(200).json({ success: true, data: { status } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.put(
  "/:dateKey/planning/one-thing",
  validateRequest({ params: dayParamsSchema, body: oneThingBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await setOneThing(req.userId, req.accessToken, dateKey, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.put(
  "/:dateKey/planning/top-three",
  validateRequest({ params: dayParamsSchema, body: topThreeBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await setTopThree(req.userId, req.accessToken, dateKey, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.post(
  "/:dateKey/planning/other-tasks",
  validateRequest({ params: dayParamsSchema, body: otherTaskBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await addOtherTask(req.userId, req.accessToken, dateKey, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.get(
  "/:dateKey/pillars",
  validateRequest({ params: dayParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const pillars = await getLifePillarsStatus(req.userId, req.accessToken, dateKey);
      return res.status(200).json({ success: true, data: { pillars } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.patch(
  "/:dateKey/pillars",
  validateRequest({ params: dayParamsSchema, body: lifePillarsUpdateSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await updateLifePillars(req.userId, req.accessToken, dateKey, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.post(
  "/:dateKey/pomodoro/start",
  validateRequest({ params: dayParamsSchema, body: pomodoroStartSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const { taskType, taskIndex } = req.body as {
        taskType: "oneThing" | "topThree" | "other";
        taskIndex?: number;
      };
      const session = await startPomodoro(req.userId, req.accessToken, dateKey, taskType, taskIndex);
      return res.status(200).json({ success: true, data: { session } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.post(
  "/:dateKey/pomodoro/:sessionId/complete",
  validateRequest({ params: pomodoroSessionParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey, sessionId } = req.params as { dateKey: string; sessionId: string };
      const document = await completePomodoro(req.userId, req.accessToken, dateKey, sessionId);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.post(
  "/:dateKey/pomodoro/:sessionId/break",
  validateRequest({ params: pomodoroSessionParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey, sessionId } = req.params as { dateKey: string; sessionId: string };
      const session = await startBreak(req.userId, dateKey, sessionId);
      return res.status(200).json({ success: true, data: { session } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.get(
  "/:dateKey/pomodoro/progress",
  validateRequest({ params: dayParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const progress = await getPomodoroProgress(req.userId, req.accessToken, dateKey);
      return res.status(200).json({ success: true, data: { progress } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.get(
  "/:dateKey/close/status",
  validateRequest({ params: dayParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const status = await getDayCloseStatus(req.userId, req.accessToken, dateKey);
      return res.status(200).json({ success: true, data: { status } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.patch(
  "/:dateKey/close/checklist",
  validateRequest({ params: dayParamsSchema, body: dayCloseChecklistSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await updateDayCloseChecklist(req.userId, req.accessToken, dateKey, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.put(
  "/:dateKey/close/reflection",
  validateRequest({ params: dayParamsSchema, body: reflectionBodySchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await submitReflection(req.userId, req.accessToken, dateKey, req.body);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

dayRoutes.post(
  "/:dateKey/close",
  validateRequest({ params: dayParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { dateKey } = req.params as { dateKey: string };
      const document = await closeDay(req.userId, req.accessToken, dateKey);
      return res.status(200).json({ success: true, data: { document } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

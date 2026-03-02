import express from "express";
import { z } from "zod";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import { listDeviceSessions, revokeDeviceSession } from "../services/sessionService";

export const deviceRoutes: express.IRouter = express.Router();

const deviceParamsSchema = z.object({
  deviceId: z.string().min(1)
});

deviceRoutes.get("/", (req, res, next) => {
  try {
    if (!req.userId) {
      return next(AppError.unauthorized("Missing user context"));
    }

    const devices = listDeviceSessions(req.userId);
    return res.status(200).json({ success: true, data: { devices } });
  } catch (err) {
    return next(err as Error);
  }
});

deviceRoutes.delete(
  "/:deviceId",
  validateRequest({ params: deviceParamsSchema }),
  (req, res, next) => {
    try {
      if (!req.userId) {
        return next(AppError.unauthorized("Missing user context"));
      }

      const { deviceId } = req.params as { deviceId: string };
      const revoked = revokeDeviceSession(req.userId, deviceId);
      if (!revoked) {
        return next(AppError.validationError("Device not found", { deviceId }));
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      return next(err as Error);
    }
  }
);

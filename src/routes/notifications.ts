import { Router } from "express";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import { notificationDeviceParamsSchema, registerDeviceSchema } from "../schemas/notifications";
import { registerDevice, unregisterDevice } from "../services/notificationService";

export const notificationRoutes = Router();

notificationRoutes.post(
  "/register-device",
  validateRequest({ body: registerDeviceSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { pushToken, deviceId, platform } = req.body as {
        pushToken: string;
        deviceId: string;
        platform: "ios" | "android" | "web";
      };
      const device = await registerDevice(req.userId, req.accessToken, pushToken, deviceId, platform);
      return res.status(200).json({ success: true, data: { device } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

notificationRoutes.delete(
  "/devices/:deviceId",
  validateRequest({ params: notificationDeviceParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId || !req.accessToken) {
        return next(AppError.unauthorized("Missing user context"));
      }
      const { deviceId } = req.params as { deviceId: string };
      await unregisterDevice(req.userId, req.accessToken, deviceId);
      return res.status(200).json({ success: true });
    } catch (err) {
      return next(err as Error);
    }
  }
);

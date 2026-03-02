import { Router } from "express";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import {
  accountDeleteSchema,
  passwordUpdateSchema,
  userProfileUpdateSchema,
  userSettingsUpdateSchema
} from "../schemas/settings";
import {
  deleteUserAccount,
  getUserProfile,
  getUserSettings,
  updateUserPassword,
  updateUserProfile,
  updateUserSettings
} from "../services/userService";

export const settingsRoutes = Router();

settingsRoutes.get("/", async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }

    const settings = await getUserSettings(req.userId, req.accessToken);
    return res.status(200).json({ success: true, data: { settings } });
  } catch (err) {
    return next(err as Error);
  }
});

settingsRoutes.patch("/", validateRequest({ body: userSettingsUpdateSchema }), async (req, res, next) => {
  try {
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }

    const settings = await updateUserSettings(req.userId, req.accessToken, req.body);
    return res.status(200).json({ success: true, data: { settings } });
  } catch (err) {
    return next(err as Error);
  }
});

settingsRoutes.get("/profile", async (req, res, next) => {
  try {
    if (!req.userId) {
      return next(AppError.unauthorized("Missing user context"));
    }

    const profile = await getUserProfile(req.userId);
    return res.status(200).json({ success: true, data: { profile } });
  } catch (err) {
    return next(err as Error);
  }
});

settingsRoutes.patch("/profile", validateRequest({ body: userProfileUpdateSchema }), async (req, res, next) => {
  try {
    if (!req.userId) {
      return next(AppError.unauthorized("Missing user context"));
    }

    const { name } = req.body as { name: string };
    const profile = await updateUserProfile(req.userId, name.trim());
    return res.status(200).json({ success: true, data: { profile } });
  } catch (err) {
    return next(err as Error);
  }
});

settingsRoutes.post("/password", validateRequest({ body: passwordUpdateSchema }), async (req, res, next) => {
  try {
    if (!req.userId || !req.userEmail) {
      return next(AppError.unauthorized("Missing user context"));
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };
    await updateUserPassword(req.userId, req.userEmail, currentPassword, newPassword);
    return res.status(200).json({ success: true, data: { updated: true } });
  } catch (err) {
    return next(err as Error);
  }
});

settingsRoutes.delete("/account", validateRequest({ body: accountDeleteSchema }), async (req, res, next) => {
  try {
    if (!req.userId) {
      return next(AppError.unauthorized("Missing user context"));
    }

    await deleteUserAccount(req.userId);
    return res.status(200).json({ success: true, data: { deleted: true } });
  } catch (err) {
    return next(err as Error);
  }
});

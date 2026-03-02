import { Router } from "express";
import { z } from "zod";
import { AppError } from "../errors";
import { validateRequest } from "../middleware/validateRequest";
import {
  blockUser,
  createUser,
  deleteUser,
  logAdminAction,
  unblockUser
} from "../services/adminService";

export const adminRoutes = Router();

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  sendWelcomeEmail: z.boolean().optional()
});

const userIdParamsSchema = z.object({
  id: z.string().uuid()
});

adminRoutes.post(
  "/users",
  validateRequest({ body: createUserSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId) {
        return next(AppError.unauthorized("Missing admin context"));
      }

      const { email, password, sendWelcomeEmail } = req.body as {
        email: string;
        password: string;
        sendWelcomeEmail?: boolean;
      };

      const user = await createUser(email, password);
      await logAdminAction(req.userId, "create", user.id, { sendWelcomeEmail: !!sendWelcomeEmail });

      return res.status(201).json({ success: true, data: { user } });
    } catch (err) {
      return next(err as Error);
    }
  }
);

adminRoutes.post(
  "/users/:id/block",
  validateRequest({ params: userIdParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId) {
        return next(AppError.unauthorized("Missing admin context"));
      }

      const { id } = req.params as { id: string };
      await blockUser(id);
      await logAdminAction(req.userId, "block", id);

      return res.status(200).json({ success: true });
    } catch (err) {
      return next(err as Error);
    }
  }
);

adminRoutes.post(
  "/users/:id/unblock",
  validateRequest({ params: userIdParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId) {
        return next(AppError.unauthorized("Missing admin context"));
      }

      const { id } = req.params as { id: string };
      await unblockUser(id);
      await logAdminAction(req.userId, "unblock", id);

      return res.status(200).json({ success: true });
    } catch (err) {
      return next(err as Error);
    }
  }
);

adminRoutes.delete(
  "/users/:id",
  validateRequest({ params: userIdParamsSchema }),
  async (req, res, next) => {
    try {
      if (!req.userId) {
        return next(AppError.unauthorized("Missing admin context"));
      }

      const { id } = req.params as { id: string };
      await deleteUser(id);
      await logAdminAction(req.userId, "delete", id);

      return res.status(200).json({ success: true });
    } catch (err) {
      return next(err as Error);
    }
  }
);

import { Router } from "express";
import { adminAuthMiddleware } from "../middleware/adminAuth";
import { authMiddleware } from "../middleware/auth";
import { adminRoutes } from "./admin";
import { authRoutes } from "./auth";
import { accountabilityRoutes } from "./accountability";
import { analyticsRoutes } from "./analytics";
import { deviceRoutes } from "./devices";
import { dayRoutes } from "./days";
import { documentRoutes } from "./documents";
import { notificationRoutes } from "./notifications";
import { periodRoutes } from "./periods";
import { settingsRoutes } from "./settings";
import { syncRoutes } from "./sync";

export const routes = Router();

routes.use("/auth", authRoutes);
routes.use("/accountability", authMiddleware, accountabilityRoutes);
routes.use("/settings", authMiddleware, settingsRoutes);
routes.use("/devices", authMiddleware, deviceRoutes);
routes.use("/documents", authMiddleware, documentRoutes);
routes.use("/days", authMiddleware, dayRoutes);
routes.use("/periods", authMiddleware, periodRoutes);
routes.use("/notifications", authMiddleware, notificationRoutes);
routes.use("/analytics", authMiddleware, analyticsRoutes);
routes.use("/sync", authMiddleware, syncRoutes);
routes.use("/admin", authMiddleware, adminAuthMiddleware, adminRoutes);

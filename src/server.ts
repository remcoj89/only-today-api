import express from "express";
import type { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import pino from "pino";
import pinoHttp from "pino-http";
import rateLimit from "express-rate-limit";
import { config } from "./config";
import { healthCheck } from "./db/client";
import { errorHandler } from "./errors";
import { authMiddleware } from "./middleware/auth";
import { routes } from "./routes";

export const app: Application = express();

app.set("trust proxy", config.trustProxy);

app.use(helmet());

const corsOptions =
  config.corsOrigins.length > 0
    ? { origin: config.corsOrigins }
    : config.nodeEnv === "production"
      ? { origin: false }
      : {};
app.use(cors(corsOptions));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path === "/health" || req.path === "/ready"
  })
);

const logger = pino({ level: config.logLevel });
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req.headers["x-request-id"] as string) || crypto.randomUUID()
  })
);

app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.get("/ready", async (_req: Request, res: Response) => {
  const ok = await healthCheck();
  if (!ok) {
    return res.status(503).json({ status: "unhealthy", message: "Database unreachable" });
  }
  res.status(200).json({ status: "ok" });
});

app.get("/protected", authMiddleware, (req: Request, res: Response) => {
  res.status(200).json({ userId: req.userId });
});

app.use(routes);

app.use((req: Request, res: Response) => {
  res.status(404).json({ success: false, message: "Not found" });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ success: false, message: "Invalid JSON" });
  }
  return errorHandler(err, req, res, next);
});

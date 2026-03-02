import express from "express";
import type { Application, NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { errorHandler } from "./errors";
import { authMiddleware } from "./middleware/auth";
import { routes } from "./routes";

export const app: Application = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.info(`${req.method} ${req.path}`);
  next();
});

app.get("/health", (_req: Request, res: Response) => {
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

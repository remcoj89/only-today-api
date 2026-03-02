import { app } from "./server";
import { config } from "./config";
import { startScheduler, stopScheduler } from "./jobs/scheduler";
import { healthCheck } from "./db/client";

const port = Number(process.env.PORT ?? 3001);

async function bootstrap() {
  const ok = await healthCheck();
  if (!ok) {
    console.error("Startup health check failed: Supabase/DB unreachable");
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.info(`API server listening on port ${port} (${config.nodeEnv})`);
  });

  if (config.enableScheduler) {
    startScheduler();
  }

  const shutdown = () => {
    console.info("Shutting down API server");
    stopScheduler();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  console.error("Bootstrap failed", err);
  process.exit(1);
});

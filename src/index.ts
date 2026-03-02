import { app } from "./server";
import { config } from "./config";
import { startScheduler, stopScheduler } from "./jobs/scheduler";

const port = Number(process.env.PORT ?? 3001);

const server = app.listen(port, () => {
  console.info(`API server listening on port ${port} (${config.nodeEnv})`);
});

startScheduler();

const shutdown = () => {
  console.info("Shutting down API server");
  stopScheduler();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

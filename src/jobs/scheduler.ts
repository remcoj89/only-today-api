import { runBackfillSummariesJob } from "./backfillSummariesJob";
import { runDayCloseReminders, runDayStartReminders } from "./notificationJobs";
import { runMissedDaysJob } from "./missedDaysJob";

type ScheduledJob = {
  name: string;
  intervalMs: number;
  timer: NodeJS.Timeout;
};

const scheduledJobs: ScheduledJob[] = [];

export function startScheduler() {
  if (scheduledJobs.length > 0) {
    return;
  }

  runBackfillSummariesJob()
    .then((count) => {
      if (count > 0) {
        console.info(`[scheduler] initial backfill summaries updated ${count} day documents`);
      }
    })
    .catch((err) => {
      console.error("[scheduler] initial backfill summaries failed", err);
    });

  const dayStartTimer = setInterval(() => {
    runDayStartReminders().catch((err) => {
      console.error("[scheduler] day start reminder failed", err);
    });
  }, 60_000);

  const dayCloseTimer = setInterval(() => {
    runDayCloseReminders().catch((err) => {
      console.error("[scheduler] day close reminder failed", err);
    });
  }, 60_000);

  scheduledJobs.push({ name: "dayStartReminders", intervalMs: 60_000, timer: dayStartTimer });
  scheduledJobs.push({ name: "dayCloseReminders", intervalMs: 60_000, timer: dayCloseTimer });

  const missedDaysTimer = setInterval(() => {
    runMissedDaysJob().catch((err) => {
      console.error("[scheduler] missed days job failed", err);
    });
  }, 86_400_000);

  const backfillSummariesTimer = setInterval(() => {
    runBackfillSummariesJob()
      .then((count) => {
        if (count > 0) {
          console.info(`[scheduler] backfill summaries updated ${count} day documents`);
        }
      })
      .catch((err) => {
        console.error("[scheduler] backfill summaries job failed", err);
      });
  }, 86_400_000);

  scheduledJobs.push({ name: "missedDaysJob", intervalMs: 86_400_000, timer: missedDaysTimer });
  scheduledJobs.push({ name: "backfillSummaries", intervalMs: 86_400_000, timer: backfillSummariesTimer });
}

export function stopScheduler() {
  scheduledJobs.forEach((job) => clearInterval(job.timer));
  scheduledJobs.length = 0;
}

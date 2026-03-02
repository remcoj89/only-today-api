import type { DayContent, DocumentBase } from "../shared";
import { DocStatus } from "../shared";
import { getSupabaseAdminClient } from "../db/client";
import { AppError } from "../errors";

function hasCompleteReflection(reflection?: DayContent["dayClose"]["reflection"]): boolean {
  if (!reflection) {
    return false;
  }
  return (
    reflection.wentWell.length > 0 &&
    reflection.whyWentWell.length > 0 &&
    reflection.repeatInFuture.length > 0 &&
    reflection.wentWrong.length > 0 &&
    reflection.whyWentWrong.length > 0 &&
    reflection.doDifferently.length > 0
  );
}

function isOneThingDone(content?: DayContent): boolean {
  const planned = content?.planning?.oneThing?.pomodorosPlanned ?? 0;
  const done = content?.planning?.oneThing?.pomodorosDone ?? 0;
  return planned > 0 && done >= planned;
}

export async function updateSummary(userId: string, dateKey: string, document: DocumentBase) {
  const admin = getSupabaseAdminClient();
  const content = document.content as DayContent;

  const payload = {
    user_id: userId,
    date: dateKey,
    day_closed: document.status === DocStatus.Closed,
    one_thing_done: isOneThingDone(content),
    reflection_present: hasCompleteReflection(content?.dayClose?.reflection),
    updated_at: new Date().toISOString()
  };

  const { error } = await admin.from("daily_status_summary").upsert(payload, {
    onConflict: "user_id,date"
  });

  if (error) {
    throw AppError.internal("Failed to update status summary");
  }
}

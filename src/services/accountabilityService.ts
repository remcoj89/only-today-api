import { createClient } from "@supabase/supabase-js";
import { DocType } from "../shared";
import { config } from "../config";
import { getSupabaseAdminClient } from "../db/client";
import { AppError } from "../errors";
import { formatDateKey } from "../utils/dateUtils";
import { getUserSettings } from "./userService";
import { getDocument } from "./documentService";
import { updateSummary } from "./statusSummaryService";

type PairRequestRecord = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  created_at: string;
  status: string;
};

type PairRecord = {
  id: string;
  user_a_id: string;
  user_b_id: string;
};

export type PartnerInfo = {
  id: string;
  email: string | null;
  timezone: string | null;
};

export type PartnerSummary = {
  date: string;
  dayClosed: boolean;
  oneThingDone: boolean;
  reflectionPresent: boolean;
};

export type CheckinRecord = {
  id: string;
  authorUserId: string;
  authorEmail: string | null;
  targetDate: string;
  message: string;
  createdAt: string;
};

type DateRange = {
  startDate: string;
  endDate: string;
};

function createAuthedClient(accessToken: string) {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  });
}

function normalizePairUsers(userId: string, partnerId: string) {
  return userId < partnerId
    ? { userAId: userId, userBId: partnerId }
    : { userAId: partnerId, userBId: userId };
}

async function findPairForUser(accessToken: string, userId: string): Promise<PairRecord | null> {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_pairs")
    .select("id,user_a_id,user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .limit(1);
  if (error) {
    throw AppError.internal("Failed to load accountability pair");
  }
  return data && data.length > 0 ? (data[0] as PairRecord) : null;
}

async function assertNoExistingPair(userId: string, partnerId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("accountability_pairs")
    .select("id")
    .or(
      `user_a_id.eq.${userId},user_b_id.eq.${userId},user_a_id.eq.${partnerId},user_b_id.eq.${partnerId}`
    )
    .limit(1);
  if (error) {
    throw AppError.internal("Failed to check existing accountability pairs");
  }
  if (data && data.length > 0) {
    throw AppError.validationError("User already has an accountability partner", {
      userId,
      partnerId
    });
  }
}

async function assertNoPendingRequests(userId: string, partnerId: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("accountability_pair_requests")
    .select("id")
    .or(
      `from_user_id.eq.${userId},to_user_id.eq.${userId},from_user_id.eq.${partnerId},to_user_id.eq.${partnerId}`
    )
    .limit(1);
  if (error) {
    throw AppError.internal("Failed to check pending pairing requests");
  }
  if (data && data.length > 0) {
    throw AppError.validationError("Pending pairing request already exists", {
      userId,
      partnerId
    });
  }
}

async function resolveUserById(id: string) {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(id);
  if (error || !data.user) {
    throw AppError.validationError("User not found", { userId: id });
  }
  return data.user;
}

async function resolveUserByEmail(email: string) {
  const perPage = 1000;
  let page = 1;
  const url = `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/users`;
  while (true) {
    const res = await fetch(`${url}?per_page=${perPage}&page=${page}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
        apikey: config.supabaseAnonKey
      }
    });
    if (!res.ok) {
      const text = await res.text();
      throw AppError.internal(`Failed to lookup user by email: ${res.status} ${text}`);
    }
    const data = (await res.json()) as { users?: Array<{ id: string; email?: string }> };
    const users = data?.users ?? [];
    const user = users.find((entry) => entry.email === email);
    if (user) {
      return user;
    }
    if (users.length < perPage) {
      break;
    }
    page += 1;
  }
  throw AppError.validationError("User not found", { email });
}

async function resolveTargetUser(toUserEmail: string, toUserId?: string) {
  if (toUserId) {
    const user = await resolveUserById(toUserId);
    if (user.email?.toLowerCase() !== toUserEmail.toLowerCase()) {
      throw AppError.validationError("User id does not match email", { toUserEmail, toUserId });
    }
    return user;
  }
  return resolveUserByEmail(toUserEmail);
}

async function getPartnerIdForUser(accessToken: string, userId: string): Promise<string> {
  const pair = await findPairForUser(accessToken, userId);
  if (!pair) {
    throw AppError.validationError("No accountability partner", { userId });
  }
  return pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id;
}

async function resolveUserEmail(userId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error) {
    throw AppError.internal("Failed to resolve user email");
  }
  return data.user?.email ?? null;
}

async function resolveUserTimezone(userId: string): Promise<string | null> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_settings")
    .select("timezone")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    return null;
  }
  return (data as { timezone: string } | null)?.timezone ?? null;
}

export async function createPairRequest(
  userId: string,
  accessToken: string,
  toUserEmail: string,
  toUserId?: string
) {
  const targetUser = await resolveTargetUser(toUserEmail, toUserId);
  if (targetUser.id === userId) {
    throw AppError.validationError("Cannot request pairing with yourself", { userId });
  }

  await assertNoExistingPair(userId, targetUser.id);
  await assertNoPendingRequests(userId, targetUser.id);

  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_pair_requests")
    .insert({
      from_user_id: userId,
      to_user_id: targetUser.id,
      status: "pending"
    })
    .select("*")
    .single();
  if (error || !data) {
    throw AppError.internal("Failed to create pairing request");
  }
  const request = data as PairRequestRecord;
  return {
    id: request.id,
    fromUserId: request.from_user_id,
    toUserId: request.to_user_id,
    createdAt: request.created_at,
    status: request.status
  };
}

export async function listPairRequests(userId: string, accessToken: string) {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_pair_requests")
    .select("id,from_user_id,to_user_id,created_at,status")
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) {
    throw AppError.internal("Failed to load pairing requests");
  }
  return (data ?? []).map((request) => ({
    id: request.id,
    fromUserId: request.from_user_id,
    toUserId: request.to_user_id,
    createdAt: request.created_at,
    status: request.status
  }));
}

export async function acceptPairRequest(userId: string, accessToken: string, requestId: string) {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_pair_requests")
    .select("*")
    .eq("id", requestId)
    .single();
  if (error || !data) {
    throw AppError.validationError("Pairing request not found", { requestId });
  }

  const request = data as PairRequestRecord;
  if (request.to_user_id !== userId) {
    throw AppError.forbidden("Pairing request is not addressed to this user");
  }

  await assertNoExistingPair(request.from_user_id, request.to_user_id);

  const { userAId, userBId } = normalizePairUsers(request.from_user_id, request.to_user_id);
  const { data: pair, error: insertError } = await client
    .from("accountability_pairs")
    .insert({ user_a_id: userAId, user_b_id: userBId })
    .select("id,user_a_id,user_b_id")
    .single();
  if (insertError || !pair) {
    throw AppError.internal("Failed to create accountability pair");
  }

  const { error: deleteError } = await client
    .from("accountability_pair_requests")
    .delete()
    .eq("id", requestId);
  if (deleteError) {
    throw AppError.internal("Failed to remove pairing request");
  }

  return {
    pairId: pair.id,
    partnerId: request.from_user_id
  };
}

export async function rejectPairRequest(userId: string, accessToken: string, requestId: string) {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_pair_requests")
    .delete()
    .eq("id", requestId)
    .eq("to_user_id", userId)
    .select("id");
  if (error) {
    throw AppError.internal("Failed to reject pairing request");
  }
  if (!data || data.length === 0) {
    throw AppError.validationError("Pairing request not found", { requestId });
  }
  return { rejected: true };
}

export async function removePair(userId: string, accessToken: string) {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_pairs")
    .delete()
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
    .select("id,user_a_id,user_b_id");
  if (error) {
    throw AppError.internal("Failed to remove accountability pair");
  }
  if (!data || data.length === 0) {
    return { removed: false };
  }
  const removed = data[0] as PairRecord;
  const partnerId = removed.user_a_id === userId ? removed.user_b_id : removed.user_a_id;
  return { removed: true, partnerId };
}

export async function getPartner(userId: string, accessToken: string): Promise<PartnerInfo | null> {
  const pair = await findPairForUser(accessToken, userId);
  if (!pair) {
    return null;
  }
  const partnerId = pair.user_a_id === userId ? pair.user_b_id : pair.user_a_id;
  const [email, timezone] = await Promise.all([
    resolveUserEmail(partnerId),
    resolveUserTimezone(partnerId)
  ]);
  return { id: partnerId, email, timezone };
}

export async function hasPendingRequest(userId: string, accessToken: string): Promise<boolean> {
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_pair_requests")
    .select("id")
    .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
    .limit(1);
  if (error) {
    throw AppError.internal("Failed to check pending pairing requests");
  }
  return !!data && data.length > 0;
}

export async function getPartnerSummary(
  userId: string,
  accessToken: string,
  dateRange: DateRange
): Promise<PartnerSummary[]> {
  const partnerId = await getPartnerIdForUser(accessToken, userId);
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("daily_status_summary")
    .select("date,day_closed,one_thing_done,reflection_present")
    .eq("user_id", partnerId)
    .gte("date", dateRange.startDate)
    .lte("date", dateRange.endDate)
    .order("date", { ascending: true });
  if (error) {
    throw AppError.internal("Failed to load partner summary");
  }
  return (data ?? []).map((row) => ({
    date: row.date,
    dayClosed: row.day_closed,
    oneThingDone: row.one_thing_done,
    reflectionPresent: row.reflection_present
  }));
}

export async function updateDailyStatusSummary(
  userId: string,
  accessToken: string,
  dateKey: string
) {
  const document = await getDocument(userId, accessToken, DocType.Day, dateKey);
  await updateSummary(userId, dateKey, document);
}

export async function createCheckin(userId: string, accessToken: string, message: string) {
  if (message.length > 500) {
    throw AppError.validationError("Check-in message too long", { maxLength: 500 });
  }

  const pair = await findPairForUser(accessToken, userId);
  if (!pair) {
    throw AppError.validationError("No accountability partner", { userId });
  }

  const settings = await getUserSettings(userId, accessToken);
  const timeZone = settings.timezone ?? "UTC";
  const dateKey = formatDateKey(new Date(), timeZone);

  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_daily_checkins")
    .insert({
      pair_id: pair.id,
      author_user_id: userId,
      target_date: dateKey,
      message
    })
    .select("*")
    .single();
  if (error || !data) {
    throw AppError.internal("Failed to create check-in");
  }
  return {
    id: data.id,
    authorUserId: data.author_user_id,
    targetDate: data.target_date,
    message: data.message,
    createdAt: data.created_at
  };
}

export async function getCheckins(
  userId: string,
  accessToken: string,
  dateRange: DateRange
): Promise<CheckinRecord[]> {
  const pair = await findPairForUser(accessToken, userId);
  if (!pair) {
    throw AppError.validationError("No accountability partner", { userId });
  }
  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_daily_checkins")
    .select("id,author_user_id,target_date,message,created_at")
    .eq("pair_id", pair.id)
    .gte("target_date", dateRange.startDate)
    .lte("target_date", dateRange.endDate)
    .order("target_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) {
    throw AppError.internal("Failed to load check-ins");
  }

  const authorIds = Array.from(new Set((data ?? []).map((row) => row.author_user_id)));
  const authorEmails = new Map<string, string | null>();
  await Promise.all(
    authorIds.map(async (authorId) => {
      const email = await resolveUserEmail(authorId);
      authorEmails.set(authorId, email);
    })
  );

  return (data ?? []).map((row) => ({
    id: row.id,
    authorUserId: row.author_user_id,
    authorEmail: authorEmails.get(row.author_user_id) ?? null,
    targetDate: row.target_date,
    message: row.message,
    createdAt: row.created_at
  }));
}

export async function getTodayCheckin(userId: string, accessToken: string) {
  const pair = await findPairForUser(accessToken, userId);
  if (!pair) {
    throw AppError.validationError("No accountability partner", { userId });
  }
  const settings = await getUserSettings(userId, accessToken);
  const timeZone = settings.timezone ?? "UTC";
  const dateKey = formatDateKey(new Date(), timeZone);

  const client = createAuthedClient(accessToken);
  const { data, error } = await client
    .from("accountability_daily_checkins")
    .select("id,author_user_id,target_date,message,created_at")
    .eq("pair_id", pair.id)
    .eq("target_date", dateKey);
  if (error) {
    throw AppError.internal("Failed to load today's check-ins");
  }

  const authorIds = Array.from(new Set((data ?? []).map((row) => row.author_user_id)));
  const authorEmails = new Map<string, string | null>();
  await Promise.all(
    authorIds.map(async (authorId) => {
      const email = await resolveUserEmail(authorId);
      authorEmails.set(authorId, email);
    })
  );

  const checkins = (data ?? []).map((row) => ({
    id: row.id,
    authorUserId: row.author_user_id,
    authorEmail: authorEmails.get(row.author_user_id) ?? null,
    targetDate: row.target_date,
    message: row.message,
    createdAt: row.created_at
  }));

  return {
    date: dateKey,
    sent: checkins.some((checkin) => checkin.authorUserId === userId),
    received: checkins.some((checkin) => checkin.authorUserId !== userId),
    checkins
  };
}

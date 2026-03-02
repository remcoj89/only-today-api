type DeviceSession = {
  deviceId: string;
  token: string;
  createdAt: string;
  lastSeenAt: string;
};

const userSessions = new Map<string, Map<string, DeviceSession>>();
const revokedTokens = new Set<string>();

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function validateSession(token: string): boolean {
  return !revokedTokens.has(token);
}

export function getUserFromSession(token: string) {
  const payload = decodeJwtPayload(token);
  if (!payload) {
    return null;
  }
  return {
    userId: typeof payload.sub === "string" ? payload.sub : undefined,
    email: typeof payload.email === "string" ? payload.email : undefined
  };
}

export function trackDeviceSession(userId: string, deviceId: string, token: string) {
  const now = new Date().toISOString();
  const sessions = userSessions.get(userId) ?? new Map<string, DeviceSession>();
  const existing = sessions.get(deviceId);
  const createdAt = existing?.createdAt ?? now;

  sessions.set(deviceId, {
    deviceId,
    token,
    createdAt,
    lastSeenAt: now
  });

  userSessions.set(userId, sessions);
}

export function listDeviceSessions(userId: string) {
  const sessions = userSessions.get(userId);
  if (!sessions) {
    return [];
  }
  return Array.from(sessions.values()).map((session) => ({
    deviceId: session.deviceId,
    createdAt: session.createdAt,
    lastSeenAt: session.lastSeenAt
  }));
}

export function revokeDeviceSession(userId: string, deviceId: string) {
  const sessions = userSessions.get(userId);
  if (!sessions || !sessions.has(deviceId)) {
    return false;
  }
  const session = sessions.get(deviceId);
  if (session) {
    revokedTokens.add(session.token);
  }
  sessions.delete(deviceId);
  return true;
}

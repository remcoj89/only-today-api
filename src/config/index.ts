import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type AppConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
  databaseUrl: string;
  nodeEnv: string;
  trustProxy: boolean;
  enableScheduler: boolean;
  corsOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
  resendApiKey?: string;
  resendFromEmail?: string;
};

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return defaultValue;
}

function parseListEnv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function parseLogLevel(value: string | undefined): AppConfig["logLevel"] {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "debug" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return "info";
}

function loadEnvFileIfPresent(filePath: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const raw = readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalIndex = trimmed.indexOf("=");
    if (equalIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalIndex).trim();
    const value = trimmed.slice(equalIndex + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function bootstrapEnv(): void {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, ".env"),
    path.resolve(cwd, ".env.local"),
    path.resolve(cwd, "../.env"),
    path.resolve(cwd, "../../.env"),
  ];

  for (const filePath of candidates) {
    loadEnvFileIfPresent(filePath);
  }
}

bootstrapEnv();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

export const config: AppConfig = {
  supabaseUrl: requireEnv("SUPABASE_URL"),
  supabaseAnonKey: requireEnv("SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  databaseUrl: requireEnv("DATABASE_URL"),
  nodeEnv: process.env.NODE_ENV ?? "development",
  trustProxy: parseBooleanEnv(process.env.TRUST_PROXY, true),
  enableScheduler: parseBooleanEnv(process.env.ENABLE_SCHEDULER, true),
  corsOrigins: parseListEnv(process.env.CORS_ORIGINS),
  logLevel: parseLogLevel(process.env.LOG_LEVEL),
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL,
};

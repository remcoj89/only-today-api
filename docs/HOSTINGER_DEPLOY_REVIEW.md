# Hostinger Business Webhosting – deployment review

## Quick conclusion

This codebase can run as a Node.js API on Hostinger **if** your Business plan has Node.js process support in hPanel.
The app is not serverless-ready; it expects a long-running process (`node dist/index.js`) and keeps in-memory state and interval jobs alive.

## Current architecture (relevant to deployment)

- Node + Express API with entrypoint `src/index.ts`.
- Build output expected in `dist/` (`npm run build`, then `npm start`).
- PostgreSQL/Supabase backend with required env vars loaded at startup.
- Background scheduler starts automatically on API boot and runs minute/daily timers in-process.

## Blocking issues to fix before production deploy

1. **Lockfile appears non-portable for npm environments**
   - `package-lock.json` contains link-style entries to `../../node_modules/.pnpm/...` (pnpm-style paths).
   - On typical Hostinger npm installs this can break reproducibility and fail TypeScript builds.
   - Repair: regenerate `package-lock.json` in a clean npm environment with standard registry access.

2. **No deployment documentation / runbook in repository**
   - There is no `README` or deployment guide in the repo.
   - Repair: add exact steps for Hostinger (Node version, build command, start command, env vars, migration command, health check URL).

3. **No `.env.example` template**
   - App hard-fails if required env vars are missing.
   - Repair: add `.env.example` with all required keys and comments.

## High-priority improvements

1. **Gate background jobs per environment / instance role**
   - Current code always calls `startScheduler()` on process boot.
   - On multiple app instances this can duplicate reminders/jobs.
   - Repair: add `ENABLE_SCHEDULER=true|false` env switch and run jobs on only one worker (or external cron).

2. **Harden CORS**
   - `cors()` currently allows any origin.
   - Repair: configure allowlist via `CORS_ORIGINS` env var.

3. **Set reverse proxy trust when behind Hostinger proxy**
   - Express currently does not set `app.set('trust proxy', ...)`.
   - IP-based auth-rate limiting may misidentify client IPs.
   - Repair: configure trust proxy and test `x-forwarded-for` behavior.

4. **Replace console logging with structured logging**
   - Request logs are plain `console.info` and may include noisy output.
   - Repair: use a structured logger with levels and request IDs.

5. **Email integration unfinished in production path**
   - `sendEmail` logs success but does not call an email provider.
   - Repair: integrate provider (Resend/SendGrid) and fail/report correctly.

## Medium-priority improvements

1. **Database migration workflow hardening**
   - `migrate.ts` executes SQL files but there is no startup/CI enforcement that migrations were applied.
   - Repair: add CI/deploy step that runs migration command before app start.

2. **Startup safety checks**
   - Add boot-time health checks for Supabase connectivity and fail-fast with clear error output.

3. **Operational health endpoints**
   - Existing `/health` is liveness only.
   - Repair: add readiness endpoint checking DB/Supabase connectivity.

4. **Security headers / limits**
   - Helmet is enabled (good), but add request rate limiting at edge/reverse proxy as well.

## Hostinger deployment checklist (proposed)

1. Provision managed PostgreSQL/Supabase and collect credentials.
2. In Hostinger hPanel:
   - select Node.js version (LTS),
   - set build command: `npm ci && npm run build`,
   - set start command: `npm start`.
3. Configure environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATABASE_URL`
   - `NODE_ENV=production`
   - `PORT` (if required by Hostinger setup)
   - (recommended) `ENABLE_SCHEDULER=false` on web nodes.
4. Run migrations during deploy: `npm run migrate`.
5. Confirm endpoints:
   - `GET /health`
   - one authenticated endpoint (e.g. `/protected`) through your frontend domain.
6. Configure CORS allowlist to your frontend domains only.
7. Enable TLS, backups, and log retention/monitoring.

## Recommended target state

- One web process for API traffic.
- Background jobs moved to dedicated worker/cron.
- Deterministic npm lockfile.
- Documented deploy + rollback procedure.

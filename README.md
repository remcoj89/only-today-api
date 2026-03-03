# Only Today API

Node.js + Express API for the Only Today app. Uses Supabase for auth and PostgreSQL, with in-memory background jobs for reminders and summaries.

## Tech stack

- **Runtime:** Node.js 20+ (LTS)
- **Framework:** Express
- **Database:** PostgreSQL via Supabase
- **Auth:** Supabase Auth

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production server (`node dist/index.js`) |
| `npm test` | Run test suite |
| `npm run migrate` | Apply database migrations |

## Environment variables

Copy `.env.example` to `.env` and fill in the required values. See [.env.example](.env.example) for all keys and descriptions.

## Hostinger deployment

### Prerequisites

- Hostinger Business Webhosting with Node.js support in hPanel
- Managed PostgreSQL or Supabase instance with credentials

### Deployment steps

1. **Node version:** Select Node.js LTS (20.x) in hPanel.

2. **Build command:**
   ```
   npm ci && npm run build
   ```

3. **Start command:**
   ```
   npm start
   ```

4. **Migrations:** Run before first start (and after each deploy if schema changes):
   ```
   npm run migrate
   ```
   For rollback of last migration:
   ```
   npm run migrate -- --rollback
   ```

5. **Environment variables:** Configure in hPanel (see `.env.example`):
   - `SUPABASE_URL` (required)
   - `SUPABASE_ANON_KEY` (required)
   - `SUPABASE_SERVICE_ROLE_KEY` (required)
   - `DATABASE_URL` (required)
   - `NODE_ENV=production`
   - `PORT` (if Hostinger requires a specific port)
   - `ENABLE_SCHEDULER` – set to `false` on web nodes if using a dedicated worker
   - `CORS_ORIGINS` – comma-separated frontend origins (e.g. `https://app.example.com`)
   - `ADMIN_EMAILS` – comma-separated admin emails (optional)
   - `RESEND_API_KEY` – for email delivery (optional; emails are skipped if missing)
   - `RESEND_FROM_EMAIL` – sender address for Resend (default: `Only Today <onboarding@resend.dev>`)

6. **Health checks:**
   - Liveness: `GET /health` → `{ status: "ok" }`
   - Readiness: `GET /ready` → 200 if DB/Supabase reachable, 503 otherwise

7. **Rollback:** Deploy previous version. If schema was migrated, run `npm run migrate -- --rollback` before or after rollback as needed.

### Recommended setup

- One web process for API traffic
- Set `ENABLE_SCHEDULER=false` on web nodes to avoid duplicate jobs
- Use a dedicated worker or single instance with `ENABLE_SCHEDULER=true` for background jobs
- Configure CORS allowlist to your frontend domain(s) only
- Enable TLS, backups, and log retention in Hostinger

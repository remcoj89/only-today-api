create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day_start_reminder_time time,
  day_close_reminder_time time,
  push_enabled boolean not null default true,
  email_for_escalations_enabled boolean not null default true,
  timezone text not null default 'UTC',
  subscription_status text not null default 'free',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.journal_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  doc_type text not null check (doc_type in ('day', 'week', 'month', 'quarter')),
  doc_key text not null,
  schema_version integer not null default 1,
  status text not null default 'open' check (status in ('open', 'closed', 'auto_closed', 'active', 'archived')),
  content jsonb not null default '{}',
  client_updated_at timestamptz not null,
  server_received_at timestamptz not null default now(),
  device_id text,
  unique (user_id, doc_type, doc_key)
);

create table if not exists public.accountability_pairs (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references auth.users (id) on delete cascade,
  user_b_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_a_id, user_b_id),
  check (user_a_id < user_b_id)
);

create table if not exists public.accountability_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  pair_id uuid not null references public.accountability_pairs (id) on delete cascade,
  author_user_id uuid not null references auth.users (id) on delete cascade,
  target_date date not null,
  message text not null check (char_length(message) <= 500),
  created_at timestamptz not null default now(),
  unique (author_user_id, target_date)
);

create table if not exists public.daily_status_summary (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  day_closed boolean not null default false,
  one_thing_done boolean not null default false,
  reflection_present boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table if not exists public.notification_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  target_date date,
  sent_at timestamptz,
  provider_message_id text,
  status text
);

create table if not exists public.admin_user_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null,
  action_type text not null,
  target_user_id uuid not null,
  created_at timestamptz not null default now(),
  metadata jsonb
);

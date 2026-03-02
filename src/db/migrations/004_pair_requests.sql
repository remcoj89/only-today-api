create table if not exists public.accountability_pair_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users (id) on delete cascade,
  to_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending')),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create index if not exists accountability_pair_requests_from_user_id_idx
  on public.accountability_pair_requests (from_user_id);

create index if not exists accountability_pair_requests_to_user_id_idx
  on public.accountability_pair_requests (to_user_id);

alter table public.accountability_pair_requests enable row level security;

do $$
begin
  create policy accountability_pair_requests_select on public.accountability_pair_requests
    for select using (auth.uid() = from_user_id or auth.uid() = to_user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_pair_requests_insert on public.accountability_pair_requests
    for insert with check (auth.uid() = from_user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_pair_requests_delete on public.accountability_pair_requests
    for delete using (auth.uid() = from_user_id or auth.uid() = to_user_id);
exception
  when duplicate_object then null;
end
$$;

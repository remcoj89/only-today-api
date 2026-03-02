alter table public.users enable row level security;
alter table public.user_settings enable row level security;
alter table public.journal_documents enable row level security;
alter table public.accountability_pairs enable row level security;
alter table public.accountability_daily_checkins enable row level security;
alter table public.daily_status_summary enable row level security;
alter table public.notification_log enable row level security;
alter table public.admin_user_actions enable row level security;

do $$
begin
  create policy users_select_own on public.users
    for select using (auth.uid() = id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy users_update_own on public.users
    for update using (auth.uid() = id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy user_settings_crud_own on public.user_settings
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy journal_documents_crud_own on public.journal_documents
    for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_pairs_select on public.accountability_pairs
    for select using (auth.uid() = user_a_id or auth.uid() = user_b_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_pairs_insert on public.accountability_pairs
    for insert with check (auth.uid() = user_a_id or auth.uid() = user_b_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_pairs_delete on public.accountability_pairs
    for delete using (auth.uid() = user_a_id or auth.uid() = user_b_id);
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_checkins_select on public.accountability_daily_checkins
    for select using (
      exists (
        select 1 from public.accountability_pairs ap
        where ap.id = accountability_daily_checkins.pair_id
          and (ap.user_a_id = auth.uid() or ap.user_b_id = auth.uid())
      )
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_checkins_insert on public.accountability_daily_checkins
    for insert with check (
      author_user_id = auth.uid()
      and exists (
        select 1 from public.accountability_pairs ap
        where ap.id = accountability_daily_checkins.pair_id
          and (ap.user_a_id = auth.uid() or ap.user_b_id = auth.uid())
      )
    );
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_checkins_update on public.accountability_daily_checkins
    for update using (author_user_id = auth.uid())
    with check (author_user_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy accountability_checkins_delete on public.accountability_daily_checkins
    for delete using (author_user_id = auth.uid());
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create policy daily_status_summary_read on public.daily_status_summary
    for select using (
      auth.uid() = user_id
      or exists (
        select 1 from public.accountability_pairs ap
        where (ap.user_a_id = auth.uid() and ap.user_b_id = daily_status_summary.user_id)
           or (ap.user_b_id = auth.uid() and ap.user_a_id = daily_status_summary.user_id)
      )
    );
exception
  when duplicate_object then null;
end
$$;

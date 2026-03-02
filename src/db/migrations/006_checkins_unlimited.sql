-- Allow multiple check-ins per user per day (for conversation-style messaging)
alter table public.accountability_daily_checkins
  drop constraint if exists accountability_daily_checkins_author_user_id_target_date_key;

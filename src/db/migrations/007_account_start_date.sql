alter table public.user_settings
  add column if not exists account_start_date date;

comment on column public.user_settings.account_start_date is
  'First day the user can have a day document. Set when onboarding completes. Days before this are not available.';

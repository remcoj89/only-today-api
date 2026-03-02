create index if not exists journal_documents_user_doc_type_idx on public.journal_documents (user_id, doc_type);
create index if not exists journal_documents_server_received_at_idx on public.journal_documents (server_received_at);
create index if not exists accountability_pairs_user_a_idx on public.accountability_pairs (user_a_id);
create index if not exists accountability_pairs_user_b_idx on public.accountability_pairs (user_b_id);
create index if not exists daily_status_summary_user_date_idx on public.daily_status_summary (user_id, date);

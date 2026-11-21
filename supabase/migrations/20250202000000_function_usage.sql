-- Per-user usage log for the Edge Functions (daily caps protect API spend).
create table if not exists public.function_usage (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fn          text not null check (fn in ('scan-document', 'send-export-email')),
  created_at  timestamptz not null default now()
);
create index if not exists function_usage_user_fn_idx on public.function_usage (user_id, fn, created_at desc);

alter table public.function_usage enable row level security;

drop policy if exists function_usage_select on public.function_usage;
create policy function_usage_select on public.function_usage for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists function_usage_insert on public.function_usage;
create policy function_usage_insert on public.function_usage for insert to authenticated
  with check (user_id = (select auth.uid()));

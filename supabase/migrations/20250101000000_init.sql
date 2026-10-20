-- =====================================================================
-- Refet Expenses – full schema, RLS and storage policies
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (idempotent).
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  farm_name   text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 60),
  type        text not null check (type in ('expense', 'income')),
  color       text not null default '#94a3b8' check (color ~* '^#[0-9a-f]{6}$'),
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, type, name)
);

create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  type         text not null check (type in ('expense', 'income')),
  amount       numeric(12, 2) not null check (amount > 0),
  tx_date      date not null default current_date,
  category_id  uuid references public.categories(id) on delete set null,
  vendor       text check (vendor is null or char_length(vendor) <= 120),
  notes        text check (notes is null or char_length(notes) <= 2000),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.transaction_images (
  id              uuid primary key default gen_random_uuid(),
  transaction_id  uuid not null references public.transactions(id) on delete cascade,
  owner_id        uuid not null references auth.users(id) on delete cascade,
  path            text not null unique,
  created_at      timestamptz not null default now()
);

-- People the farm owner shared the farm with (matched by e-mail).
create table if not exists public.farm_members (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  member_email  text not null check (member_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role          text not null default 'viewer' check (role in ('viewer', 'editor')),
  created_at    timestamptz not null default now(),
  unique (owner_id, member_email)
);

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------
create index if not exists transactions_owner_date_idx on public.transactions (owner_id, tx_date desc);
create index if not exists transactions_category_idx   on public.transactions (category_id);
create index if not exists transactions_type_idx       on public.transactions (owner_id, type);
create index if not exists tx_images_tx_idx            on public.transaction_images (transaction_id);
create index if not exists tx_images_owner_idx         on public.transaction_images (owner_id);
create index if not exists categories_owner_idx        on public.categories (owner_id);
create index if not exists farm_members_email_idx      on public.farm_members (member_email);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

create or replace function public.normalize_member_email()
returns trigger language plpgsql as $$
begin
  new.member_email = lower(trim(new.member_email));
  return new;
end $$;

drop trigger if exists farm_members_normalize on public.farm_members;
create trigger farm_members_normalize before insert or update on public.farm_members
  for each row execute function public.normalize_member_email();

-- created_by / owner_id can never be changed after insert
create or replace function public.lock_transaction_owner()
returns trigger language plpgsql as $$
begin
  new.owner_id   = old.owner_id;
  new.created_by = old.created_by;
  return new;
end $$;

drop trigger if exists transactions_lock_owner on public.transactions;
create trigger transactions_lock_owner before update on public.transactions
  for each row execute function public.lock_transaction_owner();

-- ---------------------------------------------------------------------
-- Access helper: is the current user the farm owner, or a member of it?
--   need_write = true  → owner or 'editor'
--   need_write = false → owner or any member
-- ---------------------------------------------------------------------
create or replace function public.has_farm_access(farm uuid, need_write boolean default false)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select
    farm = auth.uid()
    or exists (
      select 1
      from public.farm_members m
      where m.owner_id = farm
        and m.member_email = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (not need_write or m.role = 'editor')
    );
$$;

revoke all on function public.has_farm_access(uuid, boolean) from public, anon;
grant execute on function public.has_farm_access(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Default categories + profile creation on sign-up
-- ---------------------------------------------------------------------
create or replace function public.seed_default_categories(uid uuid)
returns void language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.categories (owner_id, name, type, color, is_default) values
    (uid, 'מספוא ותערובות',      'expense', '#16a34a', true),
    (uid, 'חשמל',                'expense', '#eab308', true),
    (uid, 'מים',                 'expense', '#0ea5e9', true),
    (uid, 'וטרינר ותרופות',      'expense', '#ef4444', true),
    (uid, 'תחזוקה ותיקונים',     'expense', '#f97316', true),
    (uid, 'שכר עבודה',           'expense', '#8b5cf6', true),
    (uid, 'דלק ותחבורה',         'expense', '#64748b', true),
    (uid, 'זרעון והרבעה',        'expense', '#ec4899', true),
    (uid, 'ביטוח ומיסים',        'expense', '#14b8a6', true),
    (uid, 'ציוד וחומרים',        'expense', '#a16207', true),
    (uid, 'אחר',                 'expense', '#94a3b8', true),
    (uid, 'הכנסה מחלב',          'income',  '#15803d', true),
    (uid, 'מכירת עגלים וסחורה',  'income',  '#0d9488', true),
    (uid, 'מכירת פרות',          'income',  '#65a30d', true),
    (uid, 'מענקים ותמיכות',      'income',  '#2563eb', true),
    (uid, 'הכנסה אחרת',          'income',  '#94a3b8', true)
  on conflict (owner_id, type, name) do nothing;
end $$;

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  perform public.seed_default_categories(new.id);
  return new;
end $$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- pin search_path on the plain trigger functions
alter function public.set_updated_at() set search_path = public;
alter function public.normalize_member_email() set search_path = public;
alter function public.lock_transaction_owner() set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Called by the app for users who signed up before this migration existed.
create or replace function public.ensure_my_profile()
returns void language plpgsql security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  insert into public.profiles (id, email, full_name)
  select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', '')
  from auth.users u where u.id = uid
  on conflict (id) do nothing;
  if not exists (select 1 from public.categories where owner_id = uid) then
    perform public.seed_default_categories(uid);
  end if;
end $$;

revoke all on function public.ensure_my_profile() from public, anon;
grant execute on function public.ensure_my_profile() to authenticated;

-- ---------------------------------------------------------------------
-- Account deletion. The client first removes the user's files through the
-- Storage API (direct deletes from storage.objects are blocked by Supabase),
-- then calls this function. Deleting the auth user cascades to profiles,
-- categories, transactions, transaction_images and farm_members.
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from auth.users where id = auth.uid();
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.transactions        enable row level security;
alter table public.transaction_images  enable row level security;
alter table public.farm_members        enable row level security;

-- profiles --------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.has_farm_access(id));

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete to authenticated
  using (id = (select auth.uid()));

-- categories ------------------------------------------------------------
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories for select to authenticated
  using (public.has_farm_access(owner_id));

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories for insert to authenticated
  with check (public.has_farm_access(owner_id, true));

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories for update to authenticated
  using (public.has_farm_access(owner_id, true))
  with check (public.has_farm_access(owner_id, true));

drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories for delete to authenticated
  using (public.has_farm_access(owner_id, true));

-- transactions ----------------------------------------------------------
drop policy if exists transactions_select on public.transactions;
create policy transactions_select on public.transactions for select to authenticated
  using (public.has_farm_access(owner_id));

drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    public.has_farm_access(owner_id, true)
    and created_by = (select auth.uid())
    and (
      category_id is null
      or exists (select 1 from public.categories c where c.id = category_id and c.owner_id = transactions.owner_id)
    )
  );

drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions for update to authenticated
  using (public.has_farm_access(owner_id, true))
  with check (
    public.has_farm_access(owner_id, true)
    and (
      category_id is null
      or exists (select 1 from public.categories c where c.id = category_id and c.owner_id = transactions.owner_id)
    )
  );

drop policy if exists transactions_delete on public.transactions;
create policy transactions_delete on public.transactions for delete to authenticated
  using (public.has_farm_access(owner_id, true));

-- transaction_images ----------------------------------------------------
drop policy if exists tx_images_select on public.transaction_images;
create policy tx_images_select on public.transaction_images for select to authenticated
  using (public.has_farm_access(owner_id));

drop policy if exists tx_images_insert on public.transaction_images;
create policy tx_images_insert on public.transaction_images for insert to authenticated
  with check (
    public.has_farm_access(owner_id, true)
    and exists (
      select 1 from public.transactions t
      where t.id = transaction_id and t.owner_id = transaction_images.owner_id
    )
  );

drop policy if exists tx_images_delete on public.transaction_images;
create policy tx_images_delete on public.transaction_images for delete to authenticated
  using (public.has_farm_access(owner_id, true));

-- farm_members ----------------------------------------------------------
drop policy if exists farm_members_select on public.farm_members;
create policy farm_members_select on public.farm_members for select to authenticated
  using (
    owner_id = (select auth.uid())
    or member_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists farm_members_insert on public.farm_members;
create policy farm_members_insert on public.farm_members for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and lower(trim(member_email)) <> lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists farm_members_update on public.farm_members;
create policy farm_members_update on public.farm_members for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- the owner can remove a member; a member can remove themselves ("leave farm")
drop policy if exists farm_members_delete on public.farm_members;
create policy farm_members_delete on public.farm_members for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or member_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- ---------------------------------------------------------------------
-- Storage: private "receipts" bucket, files live under  <owner_id>/<tx_id>/<file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts', 'receipts', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.storage_farm_access(object_name text, need_write boolean default false)
returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare
  folder text := split_part(object_name, '/', 1);
begin
  if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.has_farm_access(folder::uuid, need_write);
end $$;

revoke all on function public.storage_farm_access(text, boolean) from public, anon;
grant execute on function public.storage_farm_access(text, boolean) to authenticated;

drop policy if exists receipts_select on storage.objects;
create policy receipts_select on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.storage_farm_access(name));

drop policy if exists receipts_insert on storage.objects;
create policy receipts_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and public.storage_farm_access(name, true));

drop policy if exists receipts_update on storage.objects;
create policy receipts_update on storage.objects for update to authenticated
  using (bucket_id = 'receipts' and public.storage_farm_access(name, true))
  with check (bucket_id = 'receipts' and public.storage_farm_access(name, true));

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.storage_farm_access(name, true));

-- ---------------------------------------------------------------------
-- Backfill for users that already exist
-- ---------------------------------------------------------------------
insert into public.profiles (id, email, full_name)
select u.id, u.email, coalesce(u.raw_user_meta_data ->> 'full_name', '')
from auth.users u
on conflict (id) do nothing;

do $$
declare r record;
begin
  for r in
    select p.id from public.profiles p
    where not exists (select 1 from public.categories c where c.owner_id = p.id)
  loop
    perform public.seed_default_categories(r.id);
  end loop;
end $$;

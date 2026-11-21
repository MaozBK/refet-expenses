-- =====================================================================
-- Refet Expenses – phase 2: documents (delivery notes / receipts / invoices),
-- contacts (customers, suppliers, accountant), category groups, thumbnails,
-- and an "exports" bucket for ZIP packages.
-- Run AFTER 20250101000000_init.sql. Idempotent.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Category groups (e.g. "feed & nutrition", "herd health")
-- ---------------------------------------------------------------------
alter table public.categories
  add column if not exists group_name text check (group_name is null or char_length(group_name) <= 60);

-- ---------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------
create table if not exists public.contacts (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(trim(name)) between 1 and 120),
  kind        text not null default 'customer' check (kind in ('customer', 'supplier', 'accountant', 'other')),
  phone       text check (phone is null or char_length(phone) <= 40),
  email       text check (email is null or char_length(email) <= 200),
  notes       text check (notes is null or char_length(notes) <= 1000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (owner_id, kind, name)
);
create index if not exists contacts_owner_idx on public.contacts (owner_id);

-- ---------------------------------------------------------------------
-- Documents. direction: incoming = I received it (supplier delivery note),
-- outgoing = I issued / delivered it (milk delivery note, receipt to a customer).
-- status: received = I have it, pending = expected but missing, void = not relevant.
-- ---------------------------------------------------------------------
create table if not exists public.documents (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references auth.users(id) on delete cascade,
  uploaded_by     uuid references auth.users(id) on delete set null default auth.uid(),
  doc_type        text not null check (doc_type in ('delivery_note', 'receipt', 'invoice', 'other')),
  direction       text not null default 'incoming' check (direction in ('incoming', 'outgoing')),
  status          text not null default 'received' check (status in ('received', 'pending', 'void')),
  doc_number      text check (doc_number is null or char_length(doc_number) <= 60),
  doc_date        date,
  contact_id      uuid references public.contacts(id) on delete set null,
  amount          numeric(12, 2) check (amount is null or amount >= 0),
  notes           text check (notes is null or char_length(notes) <= 2000),
  transaction_id  uuid references public.transactions(id) on delete set null,
  ocr_used        boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists documents_owner_date_idx   on public.documents (owner_id, doc_date desc);
create index if not exists documents_owner_created_idx on public.documents (owner_id, created_at desc);
create index if not exists documents_gap_idx          on public.documents (owner_id, contact_id, doc_type, direction, doc_number);
create index if not exists documents_status_idx       on public.documents (owner_id, status);
create index if not exists documents_tx_idx           on public.documents (transaction_id);

-- ---------------------------------------------------------------------
-- Transactions: optional contact + "no receipt needed" flag
-- ---------------------------------------------------------------------
alter table public.transactions
  add column if not exists contact_id uuid references public.contacts(id) on delete set null,
  add column if not exists no_receipt_needed boolean not null default false;
create index if not exists transactions_contact_idx on public.transactions (contact_id);

-- ---------------------------------------------------------------------
-- Images can belong to a transaction OR to a document; keep a small thumbnail
-- so lists load fast on a phone.
-- ---------------------------------------------------------------------
alter table public.transaction_images alter column transaction_id drop not null;
alter table public.transaction_images
  add column if not exists document_id uuid references public.documents(id) on delete cascade,
  add column if not exists thumb_path text;
alter table public.transaction_images drop constraint if exists tx_images_parent_chk;
alter table public.transaction_images
  add constraint tx_images_parent_chk check (transaction_id is not null or document_id is not null);
create index if not exists tx_images_doc_idx on public.transaction_images (document_id);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

drop trigger if exists documents_updated_at on public.documents;
create trigger documents_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

create or replace function public.lock_contact_owner()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.owner_id = old.owner_id;
  return new;
end $$;

drop trigger if exists contacts_lock_owner on public.contacts;
create trigger contacts_lock_owner before update on public.contacts
  for each row execute function public.lock_contact_owner();

create or replace function public.lock_document_owner()
returns trigger language plpgsql
set search_path = public
as $$
begin
  new.owner_id    = old.owner_id;
  new.uploaded_by = old.uploaded_by;
  return new;
end $$;

drop trigger if exists documents_lock_owner on public.documents;
create trigger documents_lock_owner before update on public.documents
  for each row execute function public.lock_document_owner();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.contacts  enable row level security;
alter table public.documents enable row level security;

-- contacts
drop policy if exists contacts_select on public.contacts;
create policy contacts_select on public.contacts for select to authenticated
  using (public.has_farm_access(owner_id));

drop policy if exists contacts_insert on public.contacts;
create policy contacts_insert on public.contacts for insert to authenticated
  with check (public.has_farm_access(owner_id, true));

drop policy if exists contacts_update on public.contacts;
create policy contacts_update on public.contacts for update to authenticated
  using (public.has_farm_access(owner_id, true))
  with check (public.has_farm_access(owner_id, true));

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated
  using (public.has_farm_access(owner_id, true));

-- documents
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using (public.has_farm_access(owner_id));

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    public.has_farm_access(owner_id, true)
    and uploaded_by = (select auth.uid())
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = documents.owner_id))
    and (transaction_id is null or exists (
      select 1 from public.transactions t where t.id = transaction_id and t.owner_id = documents.owner_id))
  );

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using (public.has_farm_access(owner_id, true))
  with check (
    public.has_farm_access(owner_id, true)
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = documents.owner_id))
    and (transaction_id is null or exists (
      select 1 from public.transactions t where t.id = transaction_id and t.owner_id = documents.owner_id))
  );

drop policy if exists documents_delete on public.documents;
create policy documents_delete on public.documents for delete to authenticated
  using (public.has_farm_access(owner_id, true));

-- transactions: the chosen contact must belong to the same farm
drop policy if exists transactions_insert on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    public.has_farm_access(owner_id, true)
    and created_by = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.owner_id = transactions.owner_id))
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = transactions.owner_id))
  );

drop policy if exists transactions_update on public.transactions;
create policy transactions_update on public.transactions for update to authenticated
  using (public.has_farm_access(owner_id, true))
  with check (
    public.has_farm_access(owner_id, true)
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.owner_id = transactions.owner_id))
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = transactions.owner_id))
  );

-- images: parent is a transaction or a document of the same farm
drop policy if exists tx_images_insert on public.transaction_images;
create policy tx_images_insert on public.transaction_images for insert to authenticated
  with check (
    public.has_farm_access(owner_id, true)
    and (
      (transaction_id is not null and exists (
        select 1 from public.transactions t
        where t.id = transaction_id and t.owner_id = transaction_images.owner_id))
      or
      (document_id is not null and exists (
        select 1 from public.documents d
        where d.id = document_id and d.owner_id = transaction_images.owner_id))
    )
  );

-- ---------------------------------------------------------------------
-- Storage: "exports" bucket (temporary ZIP / PDF packages built in the app)
-- Files live under <owner_id>/<file>; same access rules as receipts.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exports', 'exports', false, 52428800, array['application/zip', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists exports_select on storage.objects;
create policy exports_select on storage.objects for select to authenticated
  using (bucket_id = 'exports' and public.storage_farm_access(name));

drop policy if exists exports_insert on storage.objects;
create policy exports_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'exports' and public.storage_farm_access(name, true));

drop policy if exists exports_delete on storage.objects;
create policy exports_delete on storage.objects for delete to authenticated
  using (bucket_id = 'exports' and public.storage_farm_access(name, true));

-- ---------------------------------------------------------------------
-- Richer default categories with groups (also added for existing farms)
-- ---------------------------------------------------------------------
create or replace function public.seed_default_categories(uid uuid)
returns void language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.categories (owner_id, name, type, color, is_default, group_name) values
    (uid, 'מספוא ותערובות',       'expense', '#16a34a', true, 'מזון ותזונה'),
    (uid, 'חציר ומספוא גס',       'expense', '#65a30d', true, 'מזון ותזונה'),
    (uid, 'תוספי מזון ומינרלים',  'expense', '#84cc16', true, 'מזון ותזונה'),
    (uid, 'וטרינר ותרופות',       'expense', '#ef4444', true, 'בריאות העדר'),
    (uid, 'חיסונים ובדיקות',      'expense', '#f43f5e', true, 'בריאות העדר'),
    (uid, 'זרעון והרבעה',         'expense', '#ec4899', true, 'רבייה'),
    (uid, 'חשמל',                 'expense', '#eab308', true, 'תשתיות ואנרגיה'),
    (uid, 'מים',                  'expense', '#0ea5e9', true, 'תשתיות ואנרגיה'),
    (uid, 'דלק ותחבורה',          'expense', '#64748b', true, 'תשתיות ואנרגיה'),
    (uid, 'תחזוקה ותיקונים',      'expense', '#f97316', true, 'תחזוקה וציוד'),
    (uid, 'ציוד וחומרים',         'expense', '#a16207', true, 'תחזוקה וציוד'),
    (uid, 'חלקי חילוף וכלים',     'expense', '#d97706', true, 'תחזוקה וציוד'),
    (uid, 'שכר עבודה',            'expense', '#8b5cf6', true, 'כוח אדם'),
    (uid, 'ביטוח ומיסים',         'expense', '#14b8a6', true, 'הנהלה וכללי'),
    (uid, 'הנהלת חשבונות ויעוץ',  'expense', '#06b6d4', true, 'הנהלה וכללי'),
    (uid, 'אחר',                  'expense', '#94a3b8', true, 'הנהלה וכללי'),
    (uid, 'הכנסה מחלב',           'income',  '#15803d', true, 'מכירות'),
    (uid, 'מכירת עגלים וסחורה',   'income',  '#0d9488', true, 'מכירות'),
    (uid, 'מכירת פרות',           'income',  '#65a30d', true, 'מכירות'),
    (uid, 'הזרעות לרפתות אחרות',  'income',  '#7c3aed', true, 'שירותים לאחרים'),
    (uid, 'שירותים אחרים לרפתות', 'income',  '#a855f7', true, 'שירותים לאחרים'),
    (uid, 'מענקים ותמיכות',       'income',  '#2563eb', true, 'מענקים'),
    (uid, 'הכנסה אחרת',           'income',  '#94a3b8', true, 'אחר')
  on conflict (owner_id, type, name) do update
    set group_name = coalesce(public.categories.group_name, excluded.group_name);
end $$;

revoke all on function public.seed_default_categories(uuid) from public, anon, authenticated;

-- one-time: add the new defaults / groups to every existing farm
do $$
declare r record;
begin
  for r in select id from public.profiles loop
    perform public.seed_default_categories(r.id);
  end loop;
end $$;

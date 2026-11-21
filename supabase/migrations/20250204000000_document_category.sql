-- Documents get their own category; the AI-scan / e-mail usage log is no longer needed.
alter table public.documents
  add column if not exists category_id uuid references public.categories(id) on delete set null;
create index if not exists documents_category_idx on public.documents (category_id);

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
  with check (
    public.has_farm_access(owner_id, true)
    and uploaded_by = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.owner_id = documents.owner_id))
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
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.owner_id = documents.owner_id))
    and (contact_id is null or exists (
      select 1 from public.contacts c where c.id = contact_id and c.owner_id = documents.owner_id))
    and (transaction_id is null or exists (
      select 1 from public.transactions t where t.id = transaction_id and t.owner_id = documents.owner_id))
  );

drop table if exists public.function_usage;

-- Covering indexes for foreign keys + cheaper RLS evaluation on farm_members.
create index if not exists documents_contact_idx     on public.documents (contact_id);
create index if not exists documents_uploaded_by_idx on public.documents (uploaded_by);
create index if not exists transactions_created_by_idx on public.transactions (created_by);

drop policy if exists farm_members_select on public.farm_members;
create policy farm_members_select on public.farm_members for select to authenticated
  using (
    owner_id = (select auth.uid())
    or member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

drop policy if exists farm_members_insert on public.farm_members;
create policy farm_members_insert on public.farm_members for insert to authenticated
  with check (
    owner_id = (select auth.uid())
    and lower(trim(member_email)) <> lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

drop policy if exists farm_members_delete on public.farm_members;
create policy farm_members_delete on public.farm_members for delete to authenticated
  using (
    owner_id = (select auth.uid())
    or member_email = lower(coalesce((select auth.jwt() ->> 'email'), ''))
  );

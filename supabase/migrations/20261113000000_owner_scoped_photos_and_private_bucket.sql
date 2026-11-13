-- Critical security fixes:
--   * 1.1 Drafts are no longer readable by anonymous visitors.
--   * 1.2 Photos get an owner, and writes/deletes are scoped to that owner.
--   * 1.5 The `photos` bucket becomes private; images are served with signed URLs.
--
-- Before running this on a linked project, make sure the admin account already
-- exists (Authentication -> Users). Rows that predate ownership tracking are
-- assigned to the oldest account, which is the admin of this single-user
-- gallery. If your project is different, adjust the backfill below.

-- ---------------------------------------------------------------------------
-- 1. Ownership
-- ---------------------------------------------------------------------------

-- Nullable at first: `auth.uid()` is null while the migration runs, so existing
-- rows must be backfilled before the NOT NULL constraint can be applied.
alter table public.photos
  add column if not exists owner_id uuid default auth.uid()
  references auth.users (id) on delete cascade;

-- Backfill legacy rows to the oldest account. Change this if the project has
-- multiple owners and you know which user uploaded the existing photos.
update public.photos
set owner_id = (select id from auth.users order by created_at asc limit 1)
where owner_id is null;

do $$
begin
  if exists (select 1 from public.photos where owner_id is null) then
    raise exception
      'Cannot assign owner_id: create the admin user in Authentication -> Users first';
  end if;
end;
$$;

alter table public.photos alter column owner_id set not null;

create index if not exists photos_owner_id_idx on public.photos (owner_id);

comment on column public.photos.owner_id is
  'Auth user who uploaded the photo. Reads and writes are scoped to this owner.';

-- A row must never be pointed at a different storage object after upload;
-- otherwise an owner could claim another user's draft file.
create or replace function public.photos_storage_path_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.storage_path is distinct from old.storage_path then
    raise exception 'photos.storage_path cannot be changed after upload';
  end if;

  return new;
end;
$$;

drop trigger if exists photos_storage_path_immutable on public.photos;
create trigger photos_storage_path_immutable
  before update on public.photos
  for each row
  execute function public.photos_storage_path_immutable();

-- ---------------------------------------------------------------------------
-- 2. Row policies: published rows are public, drafts stay with their owner.
-- ---------------------------------------------------------------------------

drop policy if exists "Photos are publicly readable" on public.photos;
drop policy if exists "Published photos are public, owners see their drafts" on public.photos;
create policy "Published photos are public, owners see their drafts" on public.photos
  for select
  using (published or owner_id = (select auth.uid()));

drop policy if exists "Authenticated users can add photos" on public.photos;
drop policy if exists "Users can add their own photos" on public.photos;
create policy "Users can add their own photos" on public.photos
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    -- New uploads must live in the uploader's folder and use a known image
    -- extension; this prevents rows being pointed at another user's object.
    and storage_path ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif)$')
  );

drop policy if exists "Authenticated users can update photos" on public.photos;
drop policy if exists "Owners can update their photos" on public.photos;
create policy "Owners can update their photos" on public.photos
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Authenticated users can delete photos" on public.photos;
drop policy if exists "Owners can delete their photos" on public.photos;
create policy "Owners can delete their photos" on public.photos
  for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 3. Private storage bucket + object policies
-- ---------------------------------------------------------------------------

update storage.buckets
set public = false
where id = 'photos';

-- Read: an object is readable only when its photos row is visible to the
-- caller. `public.photos` RLS already limits anonymous callers to published
-- rows and lets owners see their drafts.
drop policy if exists "Photo files are publicly readable" on storage.objects;
drop policy if exists "Photo files are readable when published or owned" on storage.objects;
create policy "Photo files are readable when published or owned" on storage.objects
  for select
  using (
    bucket_id = 'photos'
    and exists (
      select 1
      from public.photos p
      where p.storage_path = storage.objects.name
        and (p.published or p.owner_id = (select auth.uid()))
    )
  );

-- New uploads are written to `<user-id>/<uuid>.<ext>`. Legacy files at the
-- bucket root are still covered by the photos-row ownership checks below.
drop policy if exists "Authenticated users can upload photo files" on storage.objects;
drop policy if exists "Users can upload their own photo files" on storage.objects;
create policy "Users can upload their own photo files" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Authenticated users can update photo files" on storage.objects;
drop policy if exists "Owners can update their photo files" on storage.objects;
create policy "Owners can update their photo files" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.photos p
        where p.storage_path = storage.objects.name
          and p.owner_id = (select auth.uid())
      )
    )
  )
  with check (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.photos p
        where p.storage_path = storage.objects.name
          and p.owner_id = (select auth.uid())
      )
    )
  );

drop policy if exists "Authenticated users can delete photo files" on storage.objects;
drop policy if exists "Owners can delete their photo files" on storage.objects;
create policy "Owners can delete their photo files" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.photos p
        where p.storage_path = storage.objects.name
          and p.owner_id = (select auth.uid())
      )
    )
  );

-- Grid thumbnails for the free-plan path (no Supabase image transformations).
--
-- Uploads now store a small WebP/PNG thumbnail next to the original, and the
-- gallery serves that instead of the full-size file. Existing photos get one
-- from the dashboard's "Optimize images" action.

alter table public.photos
  add column if not exists thumbnail_path text;

comment on column public.photos.thumbnail_path is
  'Optional small grid image inside the `photos` bucket, e.g. <user-id>/thumbs/<uuid>.webp.';

create index if not exists photos_thumbnail_path_idx on public.photos (thumbnail_path);

-- ---------------------------------------------------------------------------
-- Keep thumbnail paths inside the uploader's folder, like storage_path.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can add their own photos" on public.photos;
create policy "Users can add their own photos" on public.photos
  for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and storage_path ~ ('^' || (select auth.uid())::text || '/[0-9a-f-]{36}\.(jpg|png|webp|avif|gif)$')
    and (
      thumbnail_path is null
      or thumbnail_path ~ ('^' || (select auth.uid())::text || '/thumbs/[0-9a-f-]{36}\.(webp|png)$')
    )
  );

drop policy if exists "Owners can update their photos" on public.photos;
create policy "Owners can update their photos" on public.photos
  for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (
    owner_id = (select auth.uid())
    and (
      thumbnail_path is null
      or thumbnail_path ~ ('^' || (select auth.uid())::text || '/thumbs/[0-9a-f-]{36}\.(webp|png)$')
    )
  );

-- ---------------------------------------------------------------------------
-- Storage reads may now resolve to a thumbnail object instead of the original.
-- ---------------------------------------------------------------------------

drop policy if exists "Photo files are readable when published or owned" on storage.objects;
create policy "Photo files are readable when published or owned" on storage.objects
  for select
  using (
    bucket_id = 'photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.photos p
        where (p.storage_path = name or p.thumbnail_path = name)
          and (p.published or p.owner_id = (select auth.uid()))
      )
    )
  );

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
        where (p.storage_path = name or p.thumbnail_path = name)
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
        where (p.storage_path = name or p.thumbnail_path = name)
          and p.owner_id = (select auth.uid())
      )
    )
  );

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
        where (p.storage_path = name or p.thumbnail_path = name)
          and p.owner_id = (select auth.uid())
      )
    )
  );

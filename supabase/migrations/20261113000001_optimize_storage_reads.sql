-- Speed up storage reads after the bucket became private.
--
-- Signed-URL creation and storage reads authorize each object through
-- `public.photos.storage_path`, which had no index. Every object therefore
-- caused a sequential scan of the photos table.
create index if not exists photos_storage_path_idx on public.photos (storage_path);

-- Short-circuit files inside the caller's own folder instead of looking up
-- their row, then fall back to the row for published files and for legacy
-- root-level objects created before photos had an owner.
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
        where p.storage_path = name
          and (p.published or p.owner_id = (select auth.uid()))
      )
    )
  );

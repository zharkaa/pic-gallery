-- Login is now implemented, so the temporary anonymous upload access from
-- 20261111000002_temporary_anon_writes.sql is no longer needed. After this
-- migration, inserts into public.photos and uploads to the `photos` bucket
-- require a signed-in user (see the `authenticated` policies in
-- 20261111000000_create_photos_and_storage.sql).

drop policy if exists "Anonymous users can add photos (temporary)" on public.photos;
drop policy if exists "Anonymous users can upload photo files (temporary)" on storage.objects;

-- TEMPORARY: the login flow is not implemented yet, so the /dashboard form
-- saves as an anonymous user. These policies only add anon INSERT access; the
-- authenticated policies from the first migration still apply.
--
-- When login is live, drop the two policies below (or delete this migration
-- before pushing) so that only signed-in users can add photos.

drop policy if exists "Anonymous users can add photos (temporary)" on public.photos;
create policy "Anonymous users can add photos (temporary)" on public.photos
  for insert
  to anon
  with check (true);

drop policy if exists "Anonymous users can upload photo files (temporary)" on storage.objects;
create policy "Anonymous users can upload photo files (temporary)" on storage.objects
  for insert
  to anon
  with check (bucket_id = 'photos');

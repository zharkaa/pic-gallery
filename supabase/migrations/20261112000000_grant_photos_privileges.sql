-- Some Supabase projects do not auto-grant Data API privileges on tables created
-- by migrations. Without these grants Postgres rejects the request with
-- "permission denied for table photos" before RLS is even evaluated, so the
-- policies (including the temporary anon ones) never apply.
--
-- The gallery reads as anon when signed out, and the dashboard/edit dialog act
-- as authenticated.

grant usage on schema public to anon, authenticated;

grant select on public.photos to anon, authenticated;
grant insert, update, delete on public.photos to authenticated;

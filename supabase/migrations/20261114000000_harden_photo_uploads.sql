-- §1 High-priority hardening, database side.
--
--   * 1.4 photo metadata gets real length/shape limits.
--   * 1.3 uploads get a per-user photo/byte quota and an hourly rate limit.
--   * 1.1/1.2/1.5 uploads now go through the `upload-photo` Edge Function,
--     which validates the bytes (magic bytes, pixel dimensions, metadata) and
--     writes objects with the service role. Direct client writes are removed.
--
-- Keep the numbers in `photo_upload_limit_status` in sync with the constants
-- at the top of `supabase/functions/upload-photo/index.ts`.

-- ---------------------------------------------------------------------------
-- 1. Metadata constraints (title, description, tags, date taken)
-- ---------------------------------------------------------------------------

-- A CHECK constraint cannot use subqueries, so tag validation lives in a small
-- immutable helper. Tags must be 1-50 characters and there can be at most 20.
create or replace function public.is_valid_photo_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(tags) <= 20
    and array_position(tags, null) is null
    and coalesce(
      (
        select bool_and(pg_catalog.char_length(tag.value) between 1 and 50)
        from pg_catalog.unnest(tags) as tag(value)
      ),
      true
    );
$$;

comment on function public.is_valid_photo_tags(text[]) is
  'Validates photos.tags: at most 20 tags, each 1-50 characters.';

-- Normalize rows created before these limits existed so adding the constraints
-- cannot fail on a gallery that is already deployed.
update public.photos
set title = left(btrim(title), 200)
where char_length(btrim(title)) > 200;

update public.photos
set title = 'Untitled photo'
where char_length(btrim(title)) = 0;

update public.photos
set description = left(description, 5000)
where char_length(description) > 5000;

-- "Not in the future" allows one day of slack: the browser picker uses the
-- visitor's local date while Postgres uses UTC, and local dates run up to
-- UTC+14. Rows further out are pre-existing bad data.
update public.photos
set date_taken = null
where date_taken > current_date + 1;

update public.photos as p
set tags = coalesce(
  (
    select array_agg(kept.value order by kept.pos)
    from (
      select left(tag.value, 50) as value, tag.pos
      from unnest(p.tags) with ordinality as tag(value, pos)
      where tag.value is not null and btrim(tag.value) <> ''
      order by tag.pos
      limit 20
    ) as kept
  ),
  '{}'
)
where not public.is_valid_photo_tags(p.tags);

alter table public.photos
  add constraint photos_title_length
    check (char_length(btrim(title)) between 1 and 200),
  add constraint photos_description_length
    check (char_length(description) <= 5000),
  add constraint photos_tags_valid
    check (public.is_valid_photo_tags(tags)),
  add constraint photos_date_taken_not_future
    check (date_taken is null or date_taken <= current_date + 1);

comment on constraint photos_date_taken_not_future on public.photos is
  'date_taken is a capture date and cannot be beyond today anywhere on Earth: one day of slack over UTC covers local-time pickers up to UTC+14.';

-- `storage_path` / `thumbnail_path` keep their shape checks in the row-level
-- security policies instead of a table CHECK: legacy rows predate the
-- `<user-id>/<uuid>.<ext>` convention and a CHECK would reject edits to them.

-- ---------------------------------------------------------------------------
-- 2. Upload accounting (needed by the quota check)
-- ---------------------------------------------------------------------------

alter table public.photos
  add column if not exists size_bytes bigint not null default 0;

alter table public.photos
  add constraint photos_size_bytes_nonnegative check (size_bytes >= 0);

comment on column public.photos.size_bytes is
  'Object bytes stored for this photo (original + thumbnail), set by the upload Edge Function.';

-- Backfill existing rows from the storage object metadata.
update public.photos as p
set size_bytes = coalesce(
  (
    select sum((object.metadata ->> 'size')::bigint)
    from storage.objects as object
    where object.bucket_id = 'photos'
      and object.name in (p.storage_path, p.thumbnail_path)
      and (object.metadata ->> 'size') ~ '^[0-9]+$'
  ),
  0
)
where p.size_bytes = 0;

-- ---------------------------------------------------------------------------
-- 3. Per-user quota and rate limit
-- ---------------------------------------------------------------------------
--
-- 500 photos, 800 MB of objects and 20 uploads per rolling hour, per user.
-- 800 MB sits below the Supabase Free plan's 1 GB project storage, so the
-- friendly quota error fires before storage itself starts rejecting writes.
-- Returns a machine-readable status so the Edge Function can answer with a
-- friendly message instead of echoing a database error.

create or replace function public.photo_upload_limit_status(p_user_id uuid, p_bytes bigint)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_bytes < 0 then 'invalid_size'
    when (
      select count(*)
      from public.photos as photo
      where photo.owner_id = p_user_id
        and photo.created_at > now() - interval '1 hour'
    ) >= 20 then 'rate_limited'
    when (
      select count(*)
      from public.photos as photo
      where photo.owner_id = p_user_id
    ) >= 500 then 'photo_quota_exceeded'
    when (
      select coalesce(sum(photo.size_bytes), 0)
      from public.photos as photo
      where photo.owner_id = p_user_id
    ) + p_bytes > 838860800 then 'storage_quota_exceeded'
    else 'ok'
  end;
$$;

comment on function public.photo_upload_limit_status(uuid, bigint) is
  'Returns ok / rate_limited / photo_quota_exceeded / storage_quota_exceeded for a new upload.';

-- Only the Edge Function (service role) and the trigger below may call this.
revoke all on function public.photo_upload_limit_status(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.photo_upload_limit_status(uuid, bigint)
  to service_role;

-- Backstop for inserts that do not come from the Edge Function. Runs as the
-- definer so the caller does not need EXECUTE on the helper above.
create or replace function public.enforce_photo_upload_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  limit_status text;
begin
  limit_status := public.photo_upload_limit_status(new.owner_id, new.size_bytes);

  if limit_status <> 'ok' then
    raise exception '%', limit_status using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function public.enforce_photo_upload_limits() is
  'Rejects inserts that exceed the per-user photo, byte, or hourly upload limits.';

drop trigger if exists photos_enforce_upload_limits on public.photos;
create trigger photos_enforce_upload_limits
  before insert on public.photos
  for each row
  execute function public.enforce_photo_upload_limits();

-- ---------------------------------------------------------------------------
-- 4. Close the direct client write paths
-- ---------------------------------------------------------------------------
--
-- The browser now posts the image to the `upload-photo` Edge Function, which
-- validates it and writes with the service role (storage policies do not apply
-- to that role). Without these policies a stolen client session can no longer
-- place arbitrary objects in the bucket or insert metadata rows directly.

drop policy if exists "Users can add their own photos" on public.photos;
revoke insert on public.photos from authenticated;

-- The function and its triggers run as service_role; make that explicit even on
-- projects that do not auto-grant Data API privileges to that role.
grant usage on schema public to service_role;
grant select, insert, update, delete on public.photos to service_role;

-- Owners still edit/publish/delete their rows, but only the metadata columns.
-- `size_bytes`, `storage_path`, `owner_id`, and `created_at` stay server-owned,
-- otherwise the quota could be edited away.
revoke update on public.photos from authenticated;
grant update (title, description, tags, date_taken, published) on public.photos
  to authenticated;

drop policy if exists "Users can upload their own photo files" on storage.objects;
drop policy if exists "Owners can update their photo files" on storage.objects;

-- Select (signed URLs) and delete (the dashboard's delete action) stay with the
-- existing owner-scoped policies.

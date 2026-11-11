-- Gallery metadata: one row per photo. The image bytes live in the `photos`
-- storage bucket, and `storage_path` is the object key inside that bucket.
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  storage_path text not null,
  created_at timestamptz not null default now()
);

comment on table public.photos is 'Gallery photos. Image files live in the `photos` storage bucket.';
comment on column public.photos.storage_path is 'Object key inside the `photos` bucket, e.g. sunset.jpg.';

create index if not exists photos_created_at_idx on public.photos (created_at desc);

alter table public.photos enable row level security;

-- Anyone can view the gallery; only signed-in users can change it.
drop policy if exists "Photos are publicly readable" on public.photos;
create policy "Photos are publicly readable" on public.photos
  for select
  using (true);

drop policy if exists "Authenticated users can add photos" on public.photos;
create policy "Authenticated users can add photos" on public.photos
  for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update photos" on public.photos;
create policy "Authenticated users can update photos" on public.photos
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Authenticated users can delete photos" on public.photos;
create policy "Authenticated users can delete photos" on public.photos
  for delete
  to authenticated
  using (true);

-- Public bucket for the image files (10 MB per file, common web image types).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'photos',
  'photos',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Photo files are publicly readable" on storage.objects;
create policy "Photo files are publicly readable" on storage.objects
  for select
  using (bucket_id = 'photos');

drop policy if exists "Authenticated users can upload photo files" on storage.objects;
create policy "Authenticated users can upload photo files" on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'photos');

drop policy if exists "Authenticated users can update photo files" on storage.objects;
create policy "Authenticated users can update photo files" on storage.objects
  for update
  to authenticated
  using (bucket_id = 'photos')
  with check (bucket_id = 'photos');

drop policy if exists "Authenticated users can delete photo files" on storage.objects;
create policy "Authenticated users can delete photo files" on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'photos');

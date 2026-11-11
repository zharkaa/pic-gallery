-- Extra metadata collected by the /dashboard upload form.
alter table public.photos
  add column if not exists tags text[] not null default '{}',
  add column if not exists date_taken date,
  add column if not exists published boolean not null default true;

comment on column public.photos.tags is 'Free-form tags entered on the upload form, e.g. {sunset,ocean}.';
comment on column public.photos.date_taken is 'Optional capture date entered on the upload form.';
comment on column public.photos.published is 'When false the photo is a draft and should be hidden from the gallery.';

-- The gallery will mostly read published rows newest first.
create index if not exists photos_published_created_at_idx
  on public.photos (published, created_at desc);

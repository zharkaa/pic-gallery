# Improvement Suggestions

Review of `pic-gallery` as of commit `f25bd9b` (gallery + login + upload + edit/delete, Supabase
Auth/DB/Storage, Vite + React Router SPA).

Severity legend: **Critical** = exploitable data loss/exposure today · **High** = should be fixed
before the app is shared publicly · **Medium** = hardening · **Low** = hygiene.

---

## 1. Critical security issues

### 1.1 Draft / unpublished photos are readable by anyone

**Where:** `supabase/migrations/20261111000000_create_photos_and_storage.sql` (select policy),
`src/data/photos.ts` (`fetchPhotoById`)

The table policy is `for select using (true)` and `anon` has `select` on `public.photos`, so the
`published = false` flag is **only a client-side filter**. Anyone with the publishable key (it is
shipped in the bundle by design) can run:

```
GET https://<ref>.supabase.co/rest/v1/photos?select=*
```

and receive hidden drafts. `fetchPhotoById()` also deliberately ignores `published`, so a draft is
viewable by URL (`/photo/<id>`), including for signed-out visitors.

The migration comment says drafts "should be hidden from the gallery" — currently they are hidden
from the *grid* only.

**Fix:** make the database, not React, enforce visibility:

```sql
drop policy if exists "Photos are publicly readable" on public.photos;

create policy "Published photos are public, owners see their drafts"
  on public.photos
  for select
  using (published or owner_id = (select auth.uid()));
```

`auth.uid()` is `null` for `anon`, so `owner_id = null` is never true and anonymous users only get
`published = true`. If you prefer, split this into `to anon using (published)` and
`to authenticated using (published or owner_id = auth.uid())`.

Then decide explicitly whether a direct link to a draft should work for its owner only (align
`fetchPhotoById` with the same rule).

### 1.2 No ownership model — any account can edit or delete every photo

**Where:** migrations (all `using (true)` write policies), `src/pages/PhotoPage.tsx`,
`src/components/uploaded-photos-list.tsx`, `supabase/config.toml` (`enable_signup = true`)

- `photos` has no `created_by`/`owner_id` column.
- Update/delete policies are `using (true) to authenticated`.
- Storage delete policy is `using (bucket_id = 'photos') to authenticated`.
- The edit button and delete menu render for **any** signed-in user.
- Sign-ups are enabled in `supabase/config.toml` (`enable_signup = true`, line 178) and email
  confirmation is off (`enable_confirmations = false`, line 229), even though the app itself has
  no sign-up form.

So anyone can call `supabase.auth.signUp()` directly from a script, confirm nothing, and get an
account that can rewrite or delete the entire gallery and every storage object. That is currently
mitigated only by the small number of people who know the project URL.

**Fix (in order):**

1. Disable public sign-up: `enable_signup = false` in `supabase/config.toml` (Dashboard →
   Authentication → Providers → Email → "Allow new users to sign up"). Keep creating accounts
   manually as the README already describes.
2. Add ownership and scope the policies:

```sql
-- add nullable first: auth.uid() is null during a migration, so a NOT NULL
-- default would fail on existing rows
alter table public.photos
  add column if not exists owner_id uuid default auth.uid()
  references auth.users (id) on delete cascade;

-- backfill existing rows once (use the id from Authentication -> Users)
update public.photos set owner_id = '<your-user-uuid>' where owner_id is null;
alter table public.photos alter column owner_id set not null;

create index if not exists photos_owner_id_idx on public.photos (owner_id);

drop policy if exists "Authenticated users can update photos" on public.photos;
create policy "Owners can update their photos" on public.photos
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "Authenticated users can delete photos" on public.photos;
create policy "Owners can delete their photos" on public.photos
  for delete to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "Authenticated users can add photos" on public.photos;
create policy "Users can add their own photos" on public.photos
  for insert to authenticated
  with check (owner_id = (select auth.uid()));
```

3. Scope storage objects to the user's folder (`<user-id>/<uuid>.<ext>`) and check the prefix:

```sql
drop policy if exists "Authenticated users can update photo files" on storage.objects;
create policy "Owners can update their files" on storage.objects
  for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
```

(and the equivalent for delete/insert).

4. Update the UI: `owner_id` in the `Photo` type, show edit/delete only when
   `photo.ownerId === user.id`, and rename "My uploads" to actually mean *my* uploads
   (`fetchAllPhotos` currently returns everyone's rows).

If the gallery is intentionally a single-admin project, an even simpler option is a
`public.admins` table or a JWT claim check (`auth.jwt() ->> 'email' = '<owner email>'`) for writes.

### 1.3 Database password stored in plaintext

**Where:** `NOTE.md` (`supabase DB = QnFDgd0NKlFPDMrg`)

Good news: `NOTE.md` is git-ignored and I verified the string never appears in git history, so it
was not published. It is still a plaintext credential on disk (and likely in shell history / chat
logs).

**Fix:**

- Rotate the database password now (Dashboard → Project Settings → Database → Reset password) and
  let the CLI prompt for it.
- Delete the value from `NOTE.md`; store credentials in a password manager or `.env.local`
  (also git-ignored).
- Never paste production secrets into notes or issue text.

### 1.4 Deleted photos can leave their image files publicly reachable

**Where:** `src/data/photos.ts` → `deletePhoto()`

The row is deleted first and the storage `remove()` result is ignored ("best-effort"). If the
object removal fails (network, RLS, timeout), the file stays in a **public** bucket and remains
reachable by URL forever. The same applies to unpublishing: the row changes, but the object URL
stays valid and may still be in browser/CDN caches (`cacheControl: "3600"`).

**Fix:** delete the object first (or use a `security definer` DB function / Edge Function so row
and object are handled together), and surface a real error if cleanup fails. Consider a periodic
reconciliation job that removes storage objects with no matching `photos.storage_path`.

### 1.5 Public storage bucket leaks more than intended

**Where:** migration `..._create_photos_and_storage.sql` (`public = true`),
`src/utils/supabase.ts` (`getPublicUrl`), storage `select` policy

- Bucket objects are served without any RLS check, so per-row `published` logic cannot protect
  images.
- The `select` policy has no `to` clause and no path restriction, so **listing** the bucket with
  the anon key returns every object key, including drafts and orphaned files.
- Public URLs are permanent, cacheable, and shareable.

**Fix:** pick one model explicitly:

- **Private gallery (recommended if drafts matter):** `public = false`, keep RLS policies scoped by
  owner, and serve published images with short-lived signed URLs
  (`createSignedUrl`, e.g. 60 minutes) instead of `getPublicUrl`. Update `Photo.src` to be resolved
  asynchronously, and shorten `cacheControl`.
- **Public images (simpler):** keep the bucket public but accept that "hidden" only hides the
  metadata; remove the broad listing policy and document the trade-off. At minimum add
  `and (storage.foldername(name))[1] = ...` scoping so other users' objects can't be listed.

---

## 2. High-priority hardening

### 2.1 Upload validation is client-side only

`src/components/photo-upload-form.tsx` checks `file.type` and `file.size` in the browser. The
bucket's `allowed_mime_types` / `file_size_limit` help, but the MIME type is a client-supplied
header and can be spoofed. Content sniffing or an HTML payload labelled `image/png` is not
validated anywhere.

**Fix:** validate magic bytes and decode the image server-side (Edge Function or a
`storage` trigger), re-encode to strip metadata, and reject images above a pixel-dimension cap
(a small 10 MB file can decode into a memory-exhausting bitmap). Keep the client checks for UX
only.

### 2.2 EXIF metadata leaks location and device data

JPEG uploads often carry GPS coordinates, camera serial numbers, and timestamps. These are
published with the file.

**Fix:** strip EXIF on upload (canvas/`createImageBitmap` re-encode, or server-side transform) and
keep only the fields the gallery actually uses.

### 2.3 No quotas or abuse limits

Any signed-in user can upload unlimited 10 MB objects, which combined with `enable_signup = true`
turns the project into free image hosting and can exhaust storage/egress quota.

**Fix:** disable sign-ups (2.2), enforce a per-user object/byte quota (DB counter + trigger or
Edge Function), and add a small upload rate limit.

### 2.4 No database-side input constraints

`title`, `description`, and `tags` are unbounded `text`/`text[]`, and the UI has no `maxLength`.
A signed-in user can insert megabytes of text per row.

```sql
alter table public.photos
  add constraint photos_title_len check (char_length(btrim(title)) between 1 and 200),
  add constraint photos_description_len check (char_length(description) <= 5000),
  add constraint photos_tags_len check (cardinality(tags) <= 20),
  add constraint photos_storage_path_shape check (
    storage_path ~ '^([0-9a-f-]{36}/)?[0-9a-f-]{36}\.(jpg|png|webp|avif|gif)$'
  );
```

Also validate `date_taken` server-side (`date_taken <= current_date`) — currently only the date
picker enforces it.

### 2.5 Raw Supabase errors are shown to users

`login-form.tsx`, `photo-upload-form.tsx`, `dashboard`, `photo page` print `error.message`
verbatim, which can expose table names, policy names, and constraint details.

**Fix:** map known cases to friendly copy, log the real error to a monitoring sink
(Sentry/console in dev), and never echo storage/database internals into the UI.

---

## 3. Authentication and session hardening

- **Email confirmation is off** (`supabase/config.toml` line 229) while sign-up is on. Even with
  sign-up disabled, keep confirmations on for any manually created account.
- **Weak password policy:** `minimum_password_length = 6`, `password_requirements = ""`. Raise to
  at least 10–12 and require `lower_upper_letters_digits_symbols`.
- **No MFA** (`auth.mfa.totp.enroll_enabled = false`) — worth enabling TOTP for an admin account
  that can delete everything.
- **No password reset / change flow** in the app, and `secure_password_change = false`.
  At minimum add "Forgot password" using `resetPasswordForEmail` plus a `/reset-password` route.
- **No CAPTCHA / backoff** on login; Supabase's default `sign_in_sign_ups = 30 / 5 min / IP` is the
  only limit. Consider Turnstile + a small client-side cooldown.
- **Session storage:** the Supabase client persists the JWT in `localStorage`, so any future XSS
  steals a full session. Adopt the PKCE flow (`auth: { flowType: 'pkce' }`) and, if you later add
  SSR, move to cookie-based sessions with `httpOnly`/`Secure`/`SameSite`.
- **Multiple auth listeners:** every `useSession()` call registers its own `getSession()` +
  `onAuthStateChange` (Navbar, Dashboard, PhotoPage, LoginPage). Centralize one provider to avoid
  duplicate fetches and the brief "loading" flash that can route-guard incorrectly.
- **Route protection is UI-only.** `/dashboard` redirects client-side; that is fine for UX, but the
  real boundary must stay in RLS (and it does for writes — keep it that way).

---

## 4. Web / deployment security

- **No Content-Security-Policy or security headers.** `index.html` has none, and `vite preview`
  adds none. Add them at the host (Netlify `_headers`, Vercel `vercel.json`, Cloudflare, nginx) or
  via a meta tag:

  ```
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: blob: https://<project-ref>.supabase.co;
  connect-src 'self' https://<project-ref>.supabase.co;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
  ```
  Also send `Referrer-Policy: strict-origin-when-cross-origin` (or `no-referrer`),
  `X-Content-Type-Options: nosniff`, `Permissions-Policy` (camera/mic/geolocation off), and
  `Strict-Transport-Security`.
- **SPA history fallback** must be configured at the host so `/photo/:id` deep links don't 404
  (not security, but it affects the "direct link to a draft" decision).
- **Direct database exposure:** `supabase/config.toml` has
  `[db.network_restrictions] enabled = false` (allow `0.0.0.0/0`). If you ever connect with the
  Postgres client from a fixed IP, restrict it.
- **Security headers are not verified in CI.** Add a check (e.g. `curl -I` against the preview
  deploy) so headers don't silently regress.

---

## 5. Dependencies, repo hygiene, and monitoring

- **Two lockfiles:** both `bun.lock` and `package-lock.json` are committed. AGENTS.md says Bun is
  the runtime; remove `package-lock.json` to avoid two dependency graphs / supply-chain drift.
- **No dependency scanning:** run `bun audit` (or `npm audit`) in CI and enable Dependabot.
- **CLI packages in `dependencies`:** `supabase`, `shadcn`, and `bunx` are build-time tools;
  move them to `devDependencies` (or use `bunx` without installing).
- **No tests or CI.** There is no workflow, no Vitest setup, and no type-check/lint gate on PRs.
  `bun run lint` and `tsc -b` already exist — wire them into CI.
- **No audit trail.** Add `created_by` (owner), `updated_at` with a trigger, and consider soft
  deletion (`deleted_at`) so accidental/malicious deletes can be recovered. Enable Supabase
  backups/PITR before real content goes in.
- **No error monitoring or alerting.** Mass deletes or upload spikes are currently invisible.
- **Leftover template files:** `src/App.css`, `src/assets/{hero.png,react.svg,vite.svg}`, and the
  Vite/React boilerplate in `README.md` are unused; clean them up. `supabase/seed.sql` still says
  "the gallery is still reading `src/data/photos.ts`", which is no longer true.
- **Env validation** is good (`requireEnv`), but make `.env.example` state that the URL must be
  HTTPS and that only publishable/anon keys belong in `VITE_*` (already documented in README).

---

## 6. Non-security improvements

**Code quality**

- Tag-input logic (`normalizeTag`, add/remove, Enter/comma/Backspace handling) and
  `todayAsInputValue()` are duplicated in `photo-upload-form.tsx` and `edit-photo-dialog.tsx` —
  extract a `TagInput` component and a `date` helper.
- `DashboardPage` and `PhotoPage` hand-roll request keys/attempt counters to avoid stale
  responses. A query library (TanStack Query) would remove this boilerplate and add caching,
  retries, and cache invalidation after upload/edit/delete.
- Unify date formatting (`formatDateTaken` vs `formatCreatedAt`) into `src/lib/date.ts`.
- Centralize auth in a `SessionProvider` (see §3) and add a `ProtectedRoute` wrapper instead of
  per-page `Navigate` checks.
- Add an error boundary and a `*` route so unknown URLs show a proper 404 page.

**UX / accessibility**

- Default the "Published" switch to **off** (draft-first) so a mistaken upload isn't instantly
  public; this pairs with §1.1.
- The upload form announces "Photo saved" visually but not to screen readers — use `aria-live`
  and move focus to the confirmation after a successful save.
- Add a password visibility toggle and inline validation to the login form.
- Pagination or infinite scroll for the gallery: `fetchPhotos` loads every row and the API caps at
  1,000 (`max_rows`), so a large gallery silently truncates.
- Image performance: no `srcset`/thumbnails, no `width`/`height` (layout shift), full-size files
  used for 4:3 tiles. Add Supabase image transformations or pre-generated thumbnails.

**Documentation**

- Replace the template README with real setup, security model (who can read/write what), and
  deployment steps; document the ownership/RLS rules next to the migrations.
- Record the intended visibility model (public gallery vs private drafts) in one place so future
  migrations don't accidentally re-open read access — the temporary anon-write migrations are a
  good example of how easy that is to get wrong.

---

## Suggested order of work

1. Rotate the DB password and remove it from `NOTE.md` (§1.3).
2. Add `owner_id`, owner-scoped write policies, and disable sign-ups (§1.2).
3. Restrict anonymous reads to `published = true` in both the table and `fetchPhotoById` (§1.1).
4. Decide the storage model; if drafts must be private, switch to a private bucket + signed URLs,
   and fix delete ordering (§1.4, §1.5).
5. Add DB constraints and server-side image validation/EXIF stripping (§2.1–2.4).
6. Harden auth (confirmations, password policy, MFA, reset flow) and hide raw errors (§2.5, §3).
7. Add CSP/security headers at the host and dependency scanning to CI (§4, §5).
8. Clean up duplication, add tests/CI, then work through §6.

Items 1–3 are small, self-contained migrations and give the largest security improvement for the
least effort.

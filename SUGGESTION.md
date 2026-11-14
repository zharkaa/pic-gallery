# Improvement Suggestions

Review of `pic-gallery` as of commit `f25bd9b` (gallery + login + upload + edit/delete, Supabase
Auth/DB/Storage, Vite + React Router SPA).

Severity legend: **High** = should be fixed before the app is shared publicly · **Medium** =
hardening · **Low** = hygiene.

---

## 1. Authentication and session hardening

- **Email confirmation is off** (`supabase/config.toml` line 230). Sign-up is disabled locally, but
  keep confirmations on for any manually created account (and disable sign-up in the hosted
  project too).
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

## 2. Web / deployment security

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

## 3. Dependencies, repo hygiene, and monitoring

- **No dependency scanning:** run `bun audit` (or `npm audit`) in CI and enable Dependabot.
- **CLI packages in `dependencies`:** `supabase`, `shadcn`, and `bunx` are build-time tools;
  move them to `devDependencies` (or use `bunx` without installing).
- **No tests or CI.** There is no workflow, no Vitest setup, and no type-check/lint gate on PRs.
  `bun run lint` and `tsc -b` already exist — wire them into CI.
- **Partial audit trail.** `owner_id` records the uploader, but there is no `updated_at` trigger
  and no soft deletion (`deleted_at`), so accidental/malicious edits and deletes cannot be
  recovered. Enable Supabase backups/PITR before real content goes in.
- **No error monitoring or alerting.** Mass deletes or upload spikes are currently invisible.
- **Leftover template files:** `src/App.css`, `src/assets/{hero.png,react.svg,vite.svg}`, and the
  template title in `README.md` are unused; clean them up. `supabase/seed.sql` still says "the
  gallery is still reading `src/data/photos.ts`", which is no longer true.
- **Env validation** is good (`requireEnv`), but make `.env.example` state that the URL must be
  HTTPS and that only publishable/anon keys belong in `VITE_*` (already documented in README).

---

## 4. Non-security improvements

**Code quality**

- Tag-input logic (`normalizeTag`, add/remove, Enter/comma/Backspace handling) and
  `todayAsInputValue()` are duplicated in `photo-upload-form.tsx` and `edit-photo-dialog.tsx` —
  extract a `TagInput` component and a `date` helper.
- `DashboardPage` and `PhotoPage` hand-roll request keys/attempt counters to avoid stale
  responses. A query library (TanStack Query) would remove this boilerplate and add caching,
  retries, and cache invalidation after upload/edit/delete.
- Unify date formatting (`formatDateTaken` vs `formatCreatedAt`) into `src/lib/date.ts`.
- Centralize auth in a `SessionProvider` (see §1) and add a `ProtectedRoute` wrapper instead of
  per-page `Navigate` checks.
- Add an error boundary and a `*` route so unknown URLs show a proper 404 page.

**UX / accessibility**

- Default the "Published" switch to **off** (draft-first) so a mistaken upload isn't instantly
  public.
- The upload form announces "Photo saved" visually but not to screen readers — use `aria-live`
  and move focus to the confirmation after a successful save.
- Add a password visibility toggle and inline validation to the login form.
- Pagination or infinite scroll for the gallery: `fetchPhotos` loads every row and the API caps at
  1,000 (`max_rows`), so a large gallery silently truncates.
- Image performance: the grid now uses pre-generated thumbnails, but images still have no
  `width`/`height` (layout shift) and the detail page serves one full-size file with no
  `srcset`/responsive variant.

**Documentation**

- The README now covers setup and the security model; add deployment steps and document the
  ownership/RLS rules next to the migrations.
- Record the intended visibility model (public gallery vs private drafts) in one place so future
  migrations don't accidentally re-open read access — the temporary anon-write migrations are a
  good example of how easy that is to get wrong.

---

## Suggested order of work

1. Harden auth (confirmations, password policy, MFA, reset flow) (§1).
2. Add CSP/security headers at the host and dependency scanning to CI (§2, §3).
3. Clean up duplication, add tests/CI, then work through §4.

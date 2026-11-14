# React + TypeScript + Vite

## Supabase

The app uses [Supabase](https://supabase.com) for the database and storage. The
shared client lives in `src/utils/supabase.ts`.

1. Create a project at [supabase.com](https://supabase.com) (or open an existing one).
2. Copy `.env.example` to `.env.local` and fill in:
   - `VITE_SUPABASE_URL` — project URL
   - `VITE_SUPABASE_PUBLISHABLE_KEY` — the publishable key (`sb_publishable_...`)
3. Restart the dev server after changing env values (`bun run dev`).

The publishable key is the same client-side key that older Supabase projects
call the **anon** key — both are safe to ship in the browser, and the client
also accepts `VITE_SUPABASE_ANON_KEY` as a fallback. Never put a secret key or
`service_role` key in a `VITE_` variable, since those are bundled into the client.

### Authentication

Login uses Supabase Auth with email + password. Supabase returns a signed JWT
session, stores it in the browser, refreshes it automatically, and attaches it
to Database/Storage requests so the `authenticated` row-level security policies
apply.

Accounts are created in the Supabase Dashboard (**Authentication → Users → Add
user**, then confirm the email if email confirmations are enabled). There is no
sign-up form in the app. The shared session hook is `src/hooks/use-session.ts`.

### Database and storage

The schema lives in `supabase/migrations/` and creates the `photos` table plus a
private `photos` storage bucket. Each row records its owner; anonymous visitors
only see published rows, and images are served with short-lived signed URLs
(drafts are visible to their owner only). Uploads also generate a small grid
thumbnail in the browser; older photos can be backfilled from the dashboard.
Apply it with the Supabase CLI:

```bash
bunx supabase@latest login                       # once per machine
bunx supabase@latest link --project-ref <ref>    # ref is in VITE_SUPABASE_URL
bunx supabase@latest db push                     # prompts for the database password
```

`supabase/seed.sql` is loaded by `supabase db reset` for local development.

### Upload validation and limits

Uploads go through the `supabase/functions/upload-photo` Edge Function. The
browser re-encodes the image first (which strips EXIF/GPS metadata and caps it at
2560 px), but the function is the security boundary:

- it authenticates the caller and reads the format from the file's magic bytes,
  not the declared `Content-Type`;
- it rejects files with EXIF/XMP/IPTC/comment metadata, images above 50 MP or
  8192 px per edge, and anything over 10 MB. The browser caps at 30 MP before
  upload because it must hold the decoded image in memory; the server cap is
  higher because the function only parses headers;
- it enforces a per-user quota of **500 photos / 800 MB** and a limit of **20
  uploads per hour**. A database trigger applies the same limits, so the quota
  cannot be bypassed by writing to the table directly. 800 MB stays below the
  Supabase Free plan's 1 GB project storage, so the friendly quota message fires
  before storage itself refuses the write;
- it writes the storage objects and metadata row with the service role. Client
  roles can no longer insert into `public.photos`, and the storage bucket has no
  client INSERT/UPDATE policy.

The database also enforces `title` (1-200 chars), `description` (≤ 5000), `tags`
(≤ 20 tags, each 1-50 chars), and `date_taken` (never in the future). The UI
mirrors these limits for a better error message, but the database is the
authority.

Deploy the function whenever `supabase/functions/upload-photo` changes:

```bash
bunx supabase@latest functions deploy upload-photo
```

The function reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the Edge
Function environment, which hosted projects provide automatically.

**Deploy order matters** for a project that is already live:

1. deploy the function (`functions deploy upload-photo`);
2. push the migration (`db push`) — this closes the direct upload paths;
3. deploy the updated frontend.

If you push the migration first, the old frontend cannot upload until the new
build is live.

### Free-plan notes

The project runs on Supabase Free and Vercel Hobby, so these are the real
ceilings:

- **Storage: 1 GB** per project (50 MB per file). The 800 MB per-user quota is
  deliberately lower so uploads fail with a friendly message first.
- **Egress: 5 GB uncached + 5 GB cached** per month. The gallery grid signs only
  thumbnails; opening a photo downloads the full-size image.
- **Edge Functions: 500k invocations** per month, 150 s wall clock. One
  invocation per upload, and the client re-encode keeps the payload small.
- **No backups.** Run `bunx supabase@latest db dump -f backup.sql` before
  `db push`; the dump does not include the storage objects.
- Free Supabase projects **pause after a week of inactivity**.
- Vercel Hobby is restricted to **non-commercial personal use**.

```ts
import { supabase } from "@/utils/supabase";

// Database (reads, edits, and deletes go through the owner-scoped policies)
const { data, error } = await supabase.from("photos").select();

// Uploads must use `uploadPhoto()` in `src/data/photos.ts`, which calls the
// `upload-photo` Edge Function. Direct storage uploads are blocked by RLS.
```


This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.
You can also try [the experimental native React Compiler support in plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react/README.md#rust-react-compiler) by using `compiler: true` in the plugin options instead of using the Babel plugin.

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

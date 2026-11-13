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
(drafts are visible to their owner only). Apply it with the Supabase CLI:

```bash
bunx supabase@latest login                       # once per machine
bunx supabase@latest link --project-ref <ref>    # ref is in VITE_SUPABASE_URL
bunx supabase@latest db push                     # prompts for the database password
```

`supabase/seed.sql` is loaded by `supabase db reset` for local development.

```ts
import { supabase } from "@/utils/supabase";

// Database
const { data, error } = await supabase.from("photos").select();

// Storage
const { data: file } = await supabase.storage
  .from("photos")
  .upload("example.jpg", file);
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

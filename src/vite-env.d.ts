/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  /** Publishable key (`sb_publishable_...`) for newer projects. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** Legacy name for the same client-side key, kept for older projects. */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

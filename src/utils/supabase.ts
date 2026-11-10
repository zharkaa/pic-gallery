import { createClient } from "@supabase/supabase-js";

// New Supabase projects expose a "publishable" key; older ones call the same
// client-side key the "anon" key. Either works here.
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

function requireEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(
      `Missing Supabase environment variable "${name}". Copy .env.example to .env.local and fill in the values.`,
    );
  }

  return value;
}

// Shared Supabase client for Database, Storage, and Auth.
// Only the project URL and publishable/anon key belong in the client bundle.
export const supabase = createClient(
  requireEnv(import.meta.env.VITE_SUPABASE_URL, "VITE_SUPABASE_URL"),
  requireEnv(supabaseKey, "VITE_SUPABASE_PUBLISHABLE_KEY"),
);

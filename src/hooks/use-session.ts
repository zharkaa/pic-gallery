import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/utils/supabase";

export type SessionStatus = "loading" | "signed-in" | "signed-out";

/**
 * Tracks the current Supabase Auth session. Supabase signs the session as a
 * JWT, persists it in the browser, refreshes it automatically, and attaches it
 * to Database/Storage requests so the `authenticated` RLS policies apply.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    let active = true;

    // Restore an existing session on first render (page refresh / new tab).
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setStatus(data.session ? "signed-in" : "signed-out");
    });

    // Keep the UI in sync with sign-in, sign-out, and token refreshes.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setStatus(nextSession ? "signed-in" : "signed-out");
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return { session, status, user: session?.user ?? null };
}

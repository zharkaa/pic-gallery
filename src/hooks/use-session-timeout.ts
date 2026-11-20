import { useEffect } from "react";

import { toast } from "@/components/ui/toast-manager";
import { supabase } from "@/utils/supabase";

/**
 * Absolute lifetime of a signed-in session. Supabase keeps refreshing the
 * access token for as long as the refresh token is valid, so without this the
 * user would stay signed in for days. This cap is enforced per sign-in.
 */
export const MAX_SESSION_AGE_MS = 3 * 60 * 60 * 1000;

// Shared across tabs so signing in or out anywhere resets the clock everywhere.
const STARTED_AT_KEY = "gallery:session-started-at";

// Frequent enough to be noticeable, cheap enough to run while idle.
const CHECK_INTERVAL_MS = 30_000;

/** "3 hours", "10 seconds", … for user-facing copy. */
function formatAge(ms: number): string {
  const units: Array<[number, string]> = [
    [60 * 60 * 1000, "hour"],
    [60 * 1000, "minute"],
    [1000, "second"],
  ];

  for (const [size, name] of units) {
    if (ms >= size) {
      const value = Math.round(ms / size);
      return `${value} ${name}${value === 1 ? "" : "s"}`;
    }
  }

  return "0 seconds";
}

function readStartedAt(): number | null {
  try {
    const raw = window.localStorage.getItem(STARTED_AT_KEY);
    if (!raw) return null;

    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // Storage can be unavailable (private mode); fall back to no persisted clock.
    return null;
  }
}

function writeStartedAt(value: number | null) {
  try {
    if (value === null) {
      window.localStorage.removeItem(STARTED_AT_KEY);
    } else {
      window.localStorage.setItem(STARTED_AT_KEY, String(value));
    }
  } catch {
    // Ignore storage failures; the session just won't expire early.
  }
}

/**
 * Signs the user out once the current session is older than
 * {@link MAX_SESSION_AGE_MS}. Mounted once, at the layout level.
 */
export function useSessionTimeout() {
  useEffect(() => {
    let isExpiring = false;

    async function expireIfNeeded() {
      if (isExpiring) return;

      const { data } = await supabase.auth.getSession();

      // Nobody is signed in, so there is no clock to keep.
      if (!data.session) {
        writeStartedAt(null);
        return;
      }

      // Sessions that predate this feature (or a cleared clock) start counting now.
      const startedAt = readStartedAt() ?? Date.now();
      writeStartedAt(startedAt);

      if (Date.now() - startedAt < MAX_SESSION_AGE_MS) return;

      isExpiring = true;

      // Revoke the session server-side, and still clear it locally if that
      // fails (e.g. the request is made while offline).
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: "local" });

      writeStartedAt(null);
      isExpiring = false;

      toast.add({
        title: "Session expired",
        description: `You have been signed out after ${formatAge(MAX_SESSION_AGE_MS)}. Please log in again.`,
        type: "info",
      });
    }

    void expireIfNeeded();

    // Start the clock on every sign-in and stop it on sign-out or token loss.
    // Token refreshes do not reset it, so the cap is absolute.
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session) {
        writeStartedAt(null);
        return;
      }

      if (event === "SIGNED_IN" || readStartedAt() === null) {
        writeStartedAt(Date.now());
      }
    });

    const timer = window.setInterval(() => void expireIfNeeded(), CHECK_INTERVAL_MS);

    // Catch sessions that aged out while the tab was in the background.
    const handleActive = () => {
      if (document.visibilityState === "visible") void expireIfNeeded();
    };
    document.addEventListener("visibilitychange", handleActive);
    window.addEventListener("focus", handleActive);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleActive);
      window.removeEventListener("focus", handleActive);
      data.subscription.unsubscribe();
    };
  }, []);
}

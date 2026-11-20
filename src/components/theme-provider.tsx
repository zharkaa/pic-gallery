import { useEffect, useState } from "react";

import { ThemeProviderContext, type Theme } from "./theme-context";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

/** Keep `<meta name="color-scheme">` in sync so native UI matches the theme. */
function applyColorScheme(scheme: "light" | "dark") {
  document
    .querySelector('meta[name="color-scheme"]')
    ?.setAttribute("content", scheme);
}

function readStoredTheme(storageKey: string): Theme | null {
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage can be blocked; fall back to the default theme.
  }

  return null;
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "vite-ui-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme(storageKey) ?? defaultTheme);

  useEffect(() => {
    const root = window.document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");

    function apply(next: Theme) {
      const resolved = next === "system" ? (media.matches ? "dark" : "light") : next;

      root.classList.remove("light", "dark");
      root.classList.add(resolved);
      applyColorScheme(resolved);
    }

    apply(theme);

    // System is resolved at mount, so follow OS changes while it is selected.
    if (theme !== "system") return;

    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const value = {
    theme,
    setTheme: (nextTheme: Theme) => {
      try {
        // `system` is the absence of an override, not a stored value.
        if (nextTheme === "system") localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, nextTheme);
      } catch {
        // Storage can be blocked; the theme still applies for this page.
      }

      setTheme(nextTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

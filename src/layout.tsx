import { Outlet } from "react-router";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./components/theme-provider";

export default function Layout() {
  return (
    // changed: flex column + min-h-svh so the page fills the space below the navbar exactly
    <div className="flex min-h-svh flex-col">
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Navbar />
      </ThemeProvider>
      {/* changed: wrapper lets pages flex to fill remaining height (navbar is 4rem + 1px border) */}
      <main className="flex flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}

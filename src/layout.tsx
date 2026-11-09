import { Outlet } from "react-router";
import Navbar from "./components/Navbar";
import { ThemeProvider } from "./components/theme-provider";

export default function Layout() {
  return (
    <div>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <Navbar />
      </ThemeProvider>
      <Outlet />
    </div>
  );
}

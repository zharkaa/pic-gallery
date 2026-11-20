import { useEffect, useState } from "react";
import { LayoutDashboard, LogIn, LogOut, Menu } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router";

import { useSession } from "@/hooks/use-session";
import { toast } from "@/components/ui/toast-manager";
import { supabase } from "@/utils/supabase";

import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** Non-color "you are here" cue for menu items. */
function CurrentPageDot() {
  return <span aria-hidden="true" className="ml-auto size-1.5 shrink-0 rounded-full bg-current" />;
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { user, status } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // `aria-current` names the current page; the dot is the non-color visual cue.
  const isHome = pathname === "/";
  const isLogin = pathname === "/login";
  const isDashboard = pathname === "/dashboard";

  async function handleSignOut() {
    const { error } = await supabase.auth.signOut();
    if (error) return;

    toast.add({
      title: "Logged out",
      description: "You have been signed out.",
      type: "success",
    });
    navigate("/");
  }

  // Show the bottom underline only once the page has been scrolled.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // Sticky so the underline stays visible while scrolling the gallery.
    <header
      className={`sticky top-0 z-50 border-b bg-background/80 backdrop-blur transition-colors duration-300 ${
        scrolled ? "border-border shadow-sm" : "border-transparent"
      }`}
    >
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
      >
        <div className="text-lg font-semibold tracking-tight">
          <Link
            to="/"
            aria-current={isHome ? "page" : undefined}
            className="underline-offset-4 aria-[current=page]:underline"
          >
            Gallery
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" aria-label="Open menu" />}
            >
              <Menu aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {user?.email && (
                <>
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                </>
              )}
              {status === "signed-out" && (
                <DropdownMenuItem
                  render={<Link to="/login" aria-current={isLogin ? "page" : undefined} />}
                >
                  <LogIn aria-hidden="true" />
                  Login
                  {isLogin && <CurrentPageDot />}
                </DropdownMenuItem>
              )}
              {user && (
                <DropdownMenuItem
                  render={<Link to="/dashboard" aria-current={isDashboard ? "page" : undefined} />}
                >
                  <LayoutDashboard aria-hidden="true" />
                  Dashboard
                  {isDashboard && <CurrentPageDot />}
                </DropdownMenuItem>
              )}
              {user && (
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut aria-hidden="true" />
                  Logout
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}

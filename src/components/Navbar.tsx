import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

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
          <Link to={{ pathname: "/" }}>Gallery</Link>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button nativeButton={false} render={<Link to={{ pathname: "/login" }} />}>
            Login
          </Button>
        </div>
      </nav>
    </header>
  );
}

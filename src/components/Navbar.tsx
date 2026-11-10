import { Link } from "react-router";
import { ModeToggle } from "./mode-toggle";
import { Button } from "./ui/button";

export default function Navbar() {
  return (
    <header className="border-b bg-background">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
      >
        <div className="text-lg font-semibold tracking-tight">
          <Link to={{ pathname: "/" }}>Gallery</Link>
        </div>

        <div className="flex items-center gap-2">
          <ModeToggle />
          <Button>
            <Link to={{ pathname: "/login" }}>Login</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

import { ModeToggle } from "./mode-toggle";

export default function Navbar() {
  return (
    <header className="border-b bg-background">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6"
      >
        <a href="#" className="text-lg font-semibold tracking-tight">
          Gallery
        </a>

        <div className="flex items-center gap-2">
          <ModeToggle />
        </div>
      </nav>
    </header>
  );
}

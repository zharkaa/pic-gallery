import { ImagePlus, Images } from "lucide-react";

import { Button } from "@/components/ui/button";

export type DashboardView = "upload" | "uploads";

type DashboardSidebarProps = {
  view: DashboardView;
  onViewChange: (view: DashboardView) => void;
  uploadCount?: number;
};

/** Sidebar navigation that switches the dashboard between uploading and browsing. */
export function DashboardSidebar({ view, onViewChange, uploadCount }: DashboardSidebarProps) {
  return (
    <aside className="lg:sticky lg:top-20">
      {/* Horizontal tabs on mobile (above the content), vertical sidebar on desktop. */}
      <nav aria-label="Dashboard" className="grid grid-cols-2 gap-1 rounded-xl border p-2 lg:flex lg:flex-col">
        <Button
          type="button"
          variant={view === "upload" ? "secondary" : "ghost"}
          aria-current={view === "upload" ? "page" : undefined}
          onClick={() => onViewChange("upload")}
          className="h-9 justify-center px-2.5 lg:justify-start"
        >
          <ImagePlus />
          Upload photo
        </Button>

        <Button
          type="button"
          variant={view === "uploads" ? "secondary" : "ghost"}
          aria-current={view === "uploads" ? "page" : undefined}
          onClick={() => onViewChange("uploads")}
          className="h-9 justify-center px-2.5 lg:justify-start"
        >
          <Images />
          My uploads
          {typeof uploadCount === "number" && uploadCount > 0 && (
            <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              {uploadCount}
            </span>
          )}
        </Button>
      </nav>
    </aside>
  );
}

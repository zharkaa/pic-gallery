import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router";

import { DashboardSidebar, type DashboardView } from "@/components/dashboard-sidebar";
import { PhotoUploadForm } from "@/components/photo-upload-form";
import { UploadedPhotosList } from "@/components/uploaded-photos-list";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-manager";
import { fetchMyPhotos, optimizePhotoThumbnail, type Photo } from "@/data/photos";
import { useSession } from "@/hooks/use-session";

type UploadsResult = {
  key: string;
  photos: Photo[];
  error: string | null;
};

export default function DashboardPage() {
  const { status, user } = useSession();
  const [view, setView] = useState<DashboardView>("upload");

  // The signed-in user's photos, including drafts, power the sidebar count and list.
  const [uploadsVersion, setUploadsVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [uploads, setUploads] = useState<UploadsResult | null>(null);

  // One-time backfill for photos uploaded before thumbnails existed.
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeProgress, setOptimizeProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const [optimizeError, setOptimizeError] = useState<string | null>(null);

  const userId = user?.id ?? null;
  const uploadsKey = `${uploadsVersion}:${attempt}`;

  useEffect(() => {
    // The page redirects without a user; skip the request until the session is ready.
    if (!userId) return;

    let active = true;

    fetchMyPhotos(userId)
      .then((photos) => {
        if (!active) return;
        setUploads({ key: uploadsKey, photos, error: null });
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setUploads({
          key: uploadsKey,
          photos: [],
          error: loadError instanceof Error ? loadError.message : "Could not load your uploads.",
        });
      });

    return () => {
      active = false;
    };
  }, [uploadsKey, userId]);

  const currentUploads = uploads?.key === uploadsKey ? uploads : null;
  const photosToOptimize = (currentUploads?.photos ?? []).filter((photo) => !photo.thumbnailPath);

  function handlePhotoUpdated(updatedPhoto: Photo) {
    setUploads((current) => {
      if (!current) return current;

      return {
        ...current,
        photos: current.photos.map((photo) =>
          photo.id === updatedPhoto.id ? updatedPhoto : photo,
        ),
      };
    });
  }

  function handlePhotoDeleted(id: string) {
    setUploads((current) => {
      if (!current) return current;

      return { ...current, photos: current.photos.filter((photo) => photo.id !== id) };
    });
  }

  async function handleOptimizePhotos() {
    if (!user || isOptimizing) return;

    const targets = photosToOptimize;
    if (targets.length === 0) return;

    setIsOptimizing(true);
    setOptimizeError(null);
    setOptimizeProgress({ done: 0, total: targets.length });

    let optimized = 0;
    let failed = 0;
    let firstError: string | null = null;

    for (const photo of targets) {
      try {
        const updated = await optimizePhotoThumbnail(photo, user.id);
        handlePhotoUpdated(updated);
        optimized += 1;
      } catch (error) {
        failed += 1;
        firstError ??= error instanceof Error ? error.message : "Could not optimize a photo.";
      } finally {
        setOptimizeProgress((current) =>
          current ? { done: current.done + 1, total: current.total } : current,
        );
      }
    }

    setIsOptimizing(false);
    setOptimizeProgress(null);
    setOptimizeError(firstError);

    toast.add({
      title: "Image optimization finished",
      description:
        failed > 0
          ? `${optimized} optimized, ${failed} could not be processed.`
          : `${optimized} photo${optimized === 1 ? "" : "s"} optimized.`,
      type: failed > 0 ? "error" : "success",
    });
  }

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  // Uploading is limited to signed-in users by the database policies, so send
  // everyone else to the login page first.
  if (status === "signed-out" || !user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="dashboard-surface mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <DashboardSidebar
          view={view}
          onViewChange={setView}
          uploadCount={uploads?.photos.length}
        />

        <div className="flex min-w-0 flex-col gap-6">
          {(isOptimizing || photosToOptimize.length > 0) && (
            <div className="flex flex-col gap-3 rounded-xl border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">
                  {isOptimizing
                    ? `Optimizing images… ${optimizeProgress?.done ?? 0}/${optimizeProgress?.total ?? 0}`
                    : `${photosToOptimize.length} photo${photosToOptimize.length === 1 ? "" : "s"} still load at full size`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isOptimizing
                    ? "Keep this tab open while thumbnails are generated."
                    : "Generate small grid thumbnails so the gallery opens faster."}
                </p>
                {optimizeError && !isOptimizing && (
                  <p className="text-xs text-destructive">{optimizeError}</p>
                )}
              </div>
              <Button
                type="button"
                onClick={handleOptimizePhotos}
                disabled={isOptimizing}
                className="shrink-0"
              >
                {isOptimizing ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Optimizing…
                  </>
                ) : (
                  "Optimize images"
                )}
              </Button>
            </div>
          )}

          {view === "upload" ? (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Add a photo</h1>
                <p className="text-sm text-muted-foreground">
                  Upload an image and fill in the details that appear in the gallery.
                </p>
              </div>

              <PhotoUploadForm
                userId={user.id}
                onSaved={() => setUploadsVersion((value) => value + 1)}
              />
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">My uploads</h1>
                <p className="text-sm text-muted-foreground">
                  Every photo you have uploaded, including drafts hidden from the gallery.
                </p>
              </div>

              <UploadedPhotosList
                photos={uploads?.photos ?? []}
                isLoading={!currentUploads}
                error={currentUploads?.error ?? null}
                onRetry={() => setAttempt((value) => value + 1)}
                onPhotoUpdated={handlePhotoUpdated}
                onPhotoDeleted={handlePhotoDeleted}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

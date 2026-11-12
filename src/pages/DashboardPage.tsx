import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router";

import { DashboardSidebar, type DashboardView } from "@/components/dashboard-sidebar";
import { PhotoUploadForm } from "@/components/photo-upload-form";
import { UploadedPhotosList } from "@/components/uploaded-photos-list";
import { fetchAllPhotos, type Photo } from "@/data/photos";
import { useSession } from "@/hooks/use-session";

type UploadsResult = {
  key: string;
  photos: Photo[];
  error: string | null;
};

export default function DashboardPage() {
  const { status } = useSession();
  const [view, setView] = useState<DashboardView>("upload");

  // Every photo, including drafts, powers both the sidebar count and the list.
  const [uploadsVersion, setUploadsVersion] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [uploads, setUploads] = useState<UploadsResult | null>(null);

  const uploadsKey = `${uploadsVersion}:${attempt}`;

  useEffect(() => {
    let active = true;

    fetchAllPhotos()
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
  }, [uploadsKey]);

  const currentUploads = uploads?.key === uploadsKey ? uploads : null;

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
  if (status === "signed-out") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <DashboardSidebar
          view={view}
          onViewChange={setView}
          uploadCount={uploads?.photos.length}
        />

        <div className="order-first flex min-w-0 flex-col gap-6 lg:order-none">
          {view === "upload" ? (
            <>
              <div className="flex flex-col gap-1">
                <h1 className="text-2xl font-semibold tracking-tight">Add a photo</h1>
                <p className="text-sm text-muted-foreground">
                  Upload an image and fill in the details that appear in the gallery.
                </p>
              </div>

              <PhotoUploadForm onSaved={() => setUploadsVersion((value) => value + 1)} />
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

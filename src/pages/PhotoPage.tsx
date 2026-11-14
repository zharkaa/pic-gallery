import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { Link, useParams } from "react-router";

import { EditPhotoDialog } from "@/components/edit-photo-dialog";
import { SkeletonImage } from "@/components/skeleton-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPhotoById, type Photo } from "@/data/photos";
import { logError, toFriendlyMessage } from "@/lib/errors";
import { useSession } from "@/hooks/use-session";

type LoadState = "loading" | "ready" | "not-found" | "error";

type PhotoResult = {
  key: string;
  photo: Photo | null;
  error: string | null;
};

/** `date_taken` is a plain YYYY-MM-DD date, so parse it in local time. */
function formatDateTaken(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function PhotoPage() {
  const { id } = useParams();
  const { user } = useSession();

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<PhotoResult | null>(null);

  useEffect(() => {
    if (!id) return;

    let active = true;
    const requestKey = `${id}:${attempt}`;

    void (async () => {
      try {
        const fetchedPhoto = await fetchPhotoById(id);
        if (!active) return;
        setResult({ key: requestKey, photo: fetchedPhoto, error: null });
      } catch (error) {
        logError("load photo", error);
        const message = await toFriendlyMessage(
          error,
          "Could not load this photo. Please try again.",
        );
        if (!active) return;
        setResult({ key: requestKey, photo: null, error: message });
      }
    })();

    return () => {
      active = false;
    };
  }, [id, attempt]);

  // Derive the view from the resolved request so switching photos (or retrying)
  // shows the loading state without setting it synchronously in an effect.
  const requestKey = id ? `${id}:${attempt}` : null;
  const photo = result?.photo ?? null;
  const loadError = result?.error ?? null;

  let loadState: LoadState;
  if (!id) loadState = "not-found";
  else if (!result || result.key !== requestKey) loadState = "loading";
  else if (result.error) loadState = "error";
  else if (!result.photo) loadState = "not-found";
  else loadState = "ready";

  if (loadState === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading photo"
        className="grid h-[calc(100svh-4rem-1px)] grid-cols-1 grid-rows-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden md:grid-cols-2 md:grid-rows-1"
      >
        <Skeleton className="h-full w-full rounded-none" />

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6 md:p-10">
          <Skeleton className="h-9 w-2/3" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <Skeleton className="h-4 w-44" />
          <div className="mt-auto flex flex-wrap gap-1.5 border-t pt-4">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-16" />
          </div>
        </div>

        <span className="sr-only">Loading photo…</span>
      </div>
    );
  }

  if (loadState === "not-found") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Photo not found</h1>
        <Link to="/" className="text-sm underline underline-offset-4 hover:text-primary">
          Back to gallery
        </Link>
      </div>
    );
  }

  if (loadState === "error" || !photo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Could not load photo</h1>
        <p className="max-w-md text-sm text-muted-foreground">{loadError}</p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </Button>
          <Button nativeButton={false} render={<Link to="/" />}>
            Back to gallery
          </Button>
        </div>
      </div>
    );
  }

  function handleUpdated(updatedPhoto: Photo) {
    setResult((current) => (current ? { ...current, photo: updatedPhoto } : current));
  }

  return (
    // Locked to the space below the navbar so the page itself never scrolls.
    // Mobile stacks image/details; desktop splits them side by side.
    <div className="relative grid h-[calc(100svh-4rem-1px)] grid-cols-1 grid-rows-[minmax(0,1.5fr)_minmax(0,1fr)] overflow-hidden md:grid-cols-2 md:grid-rows-1">
      {/* Edit lives in the top corner and only appears for the photo's owner. */}
      {user?.id === photo.ownerId && (
        <div className="absolute top-4 right-4 z-10">
          <EditPhotoDialog photo={photo} onUpdated={handleUpdated} />
        </div>
      )}

      {/* Left half: the picture, scaled to fit inside the available space.
          `bg-background` makes the empty sides blend into the current theme.
          The small thumbnail shows immediately while the full image loads. */}
      <div className="relative min-h-0 overflow-hidden bg-background">
        {photo.thumbnailPath && (
          <img
            src={photo.thumbnailSrc}
            alt=""
            aria-hidden="true"
            decoding="async"
            className="pointer-events-none absolute inset-0 h-full w-full scale-105 object-contain blur-2xl"
          />
        )}
        <SkeletonImage
          src={photo.src}
          alt={photo.title}
          skeletonClassName={photo.thumbnailPath ? "bg-transparent" : undefined}
          className="relative h-full w-full object-contain"
        />
      </div>

      {/* Right half: title, with the description right below it. Scrolls on its
          own if the text is longer than the screen, keeping the page fixed. */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto p-6 md:p-10">
        <h1 className="pr-24 text-3xl font-semibold tracking-tight">{photo.title}</h1>
        {photo.description ? (
          <p className="text-muted-foreground">{photo.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground italic">No description yet.</p>
        )}

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0" />
          {photo.dateTaken ? (
            <span>
              Taken on <time dateTime={photo.dateTaken}>{formatDateTaken(photo.dateTaken)}</time>
            </span>
          ) : (
            <span className="italic">No date added</span>
          )}
        </div>

        {/* Tags stay anchored to the bottom of the detail column. */}
        <ul aria-label="Tags" className="mt-auto flex flex-wrap gap-1.5 border-t pt-4">
          {photo.tags.length > 0 ? (
            photo.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
              >
                {tag}
              </li>
            ))
          ) : (
            <li className="rounded-md border border-dashed border-border/60 px-2 py-0.5 text-xs text-muted-foreground italic">
              No tags added
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

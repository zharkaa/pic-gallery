import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { Link } from "react-router";

import { SkeletonImage } from "@/components/skeleton-image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchPhotos, type Photo } from "@/data/photos";

type GalleryState = "loading" | "ready" | "error";

function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [state, setState] = useState<GalleryState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    fetchPhotos()
      .then((rows) => {
        if (!active) return;
        setPhotos(rows);
        setState("ready");
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(loadError instanceof Error ? loadError.message : "Could not load the gallery.");
        setState("error");
      });

    return () => {
      active = false;
    };
  }, [attempt]);

  function retry() {
    setState("loading");
    setError(null);
    setAttempt((value) => value + 1);
  }

  if (state === "loading") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label="Loading photos"
        className="grid w-full flex-1 auto-rows-fr grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-full w-full rounded-none" />
        ))}
        <span className="sr-only">Loading photos…</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Could not load the gallery</h1>
        <p className="max-w-md text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <ImageOff className="size-8 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">No photos yet</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload your first photo to see it here.
          </p>
        </div>
        <Button nativeButton={false} render={<Link to="/dashboard" />}>
          Upload a photo
        </Button>
      </div>
    );
  }

  return (
    // Full-width gallery with uniform 4:3 tiles that scroll normally instead of
    // stretching to fill the viewport.
    <div className="grid w-full grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {photos.map((photo) => (
        // Whole tile is a link to its detail page. The image fills the tile,
        // and the title panel slides up over the bottom half on hover/focus.
        <Link
          key={photo.id}
          to={`/photo/${photo.id}`}
          className="group relative aspect-[4/3] overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <SkeletonImage
            src={photo.src}
            alt={photo.title}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />

          {/* Starts fully below the tile, then slides up to cover its lower half. */}
          <div className="absolute inset-x-0 bottom-0 flex h-1/2 translate-y-full items-end bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-visible:translate-y-0">
            <h2 className="text-lg font-medium text-white">{photo.title}</h2>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default App;

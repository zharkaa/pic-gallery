import { Link, useParams } from "react-router";

import { getPhotoById } from "@/data/photos";

export default function PhotoPage() {
  const { id } = useParams();
  const photo = id ? getPhotoById(id) : undefined;

  // TODO: replace with a nicer "not found" page later if needed.
  if (!photo) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">Photo not found</h1>
        <Link to="/" className="text-sm underline underline-offset-4 hover:text-primary">
          Back to gallery
        </Link>
      </div>
    );
  }

  return (
    // Two halves: image on the left, title/description on the right (stacked on mobile).
    <div className="grid flex-1 grid-cols-1 md:grid-cols-2">
      {/* Left half: the picture. Same aspect/object-cover approach as the cards. */}
      <div className="relative min-h-[50svh] overflow-hidden bg-muted md:min-h-0">
        {photo.src ? (
          <img
            src={photo.src}
            alt={photo.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
            Image placeholder — {photo.title}
          </div>
        )}
      </div>

      {/* Right half: title, with the description right below it. */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <h1 className="text-3xl font-semibold tracking-tight">{photo.title}</h1>
        <p className="text-muted-foreground">{photo.description}</p>
      </div>
    </div>
  );
}

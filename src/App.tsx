import { Link } from "react-router";

import { photos } from "@/data/photos";

function App() {
  return (
    // Fills all remaining space below the navbar, edge to edge.
    <div className="flex flex-1 flex-col">
      <div className="grid flex-1 auto-rows-[minmax(38svh,1fr)] grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          // Whole tile is a link to its detail page. The image fills the tile,
          // and the title panel slides up over the bottom half on hover/focus.
          <Link
            key={photo.id}
            to={`/photo/${photo.id}`}
            className="group relative block min-h-0 overflow-hidden bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
          >
            {photo.src ? (
              // TODO: this is what renders once `src` is set on the dummy data.
              <img
                src={photo.src}
                alt={photo.title}
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                Image placeholder — {photo.title}
              </div>
            )}

            {/* Starts fully below the tile, then slides up to cover its lower half. */}
            <div className="absolute inset-x-0 bottom-0 flex h-1/2 translate-y-full items-end bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 transition-transform duration-300 ease-out group-hover:translate-y-0 group-focus-visible:translate-y-0">
              <h2 className="text-lg font-medium text-white">{photo.title}</h2>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default App;

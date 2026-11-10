import { Link } from "react-router";

import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { photos } from "@/data/photos";

function App() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          // Whole card is a link to its detail page.
          <Link
            key={photo.id}
            to={`/photo/${photo.id}`}
            className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* `pt-0` keeps the image flush with the top of the card. */}
            <Card className="pt-0 transition hover:ring-foreground/30">
              {/* Fixed aspect ratio keeps every card the same size, so swapping the
                  placeholder for a real <img> won't change the layout. */}
              <div className="aspect-[4/3] w-full overflow-hidden bg-muted">
                {photo.src ? (
                  // TODO: this is what renders once `src` is set on the dummy data.
                  <img
                    src={photo.src}
                    alt={photo.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                    Image placeholder — {photo.title}
                  </div>
                )}
              </div>
              <CardContent>
                <CardTitle>{photo.title}</CardTitle>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default App;

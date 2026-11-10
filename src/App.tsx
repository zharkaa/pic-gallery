import { Card, CardContent, CardTitle } from "@/components/ui/card";

type Photo = {
  id: string;
  title: string;
  /**
   * TODO: fill this in with the real image URL later, e.g. "/photos/sunset.jpg".
   * While it is undefined, the card shows a text placeholder instead.
   */
  src?: string;
};

// TODO: replace this dummy data with real photos later.
const photos: Photo[] = [
  { id: "1", title: "Sunset over the ocean" },
  { id: "2", title: "Mountain trail at sunrise" },
  { id: "3", title: "City lights at night" },
  { id: "4", title: "Forest in the fog" },
  { id: "5", title: "Desert dunes" },
  { id: "6", title: "Snowy cabin" },
];

function App() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo) => (
          // `pt-0` keeps the image flush with the top of the card.
          <Card key={photo.id} className="pt-0">
            {/* Fixed aspect ratio keeps every card the same size, so swapping the
                placeholder for a real <img> won't change the layout. */}
            <div className="aspect-4/3 w-full overflow-hidden bg-muted">
              {photo.src ? (
                // TODO: this is what renders once `src` is set on the dummy data above.
                <img src={photo.src} alt={photo.title} className="h-full w-full object-cover" />
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
        ))}
      </div>
    </div>
  );
}

export default App;

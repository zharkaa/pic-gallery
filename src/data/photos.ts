export type Photo = {
  id: string;
  title: string;
  /**
   * TODO: replace these dummy descriptions with the real ones later.
   */
  description: string;
  /**
   * TODO: fill this in with the real image URL later, e.g. "/photos/sunset.jpg".
   * While it is undefined, the card/page shows a text placeholder instead.
   */
  src?: string;
};

// TODO: replace this dummy data with real photos later.
export const photos: Photo[] = [
  {
    id: "1",
    title: "Sunset over the ocean",
    description:
      "Warm orange and pink light spreads across the water as the sun dips below the horizon.",
  },
  {
    id: "2",
    title: "Mountain trail at sunrise",
    description:
      "A quiet path winds through the mountains while the first light of day hits the peaks.",
  },
  {
    id: "3",
    title: "City lights at night",
    description:
      "Bright windows and street lights glow against the dark skyline of a busy city.",
  },
  {
    id: "4",
    title: "Forest in the fog",
    description:
      "Tall trees fade into the mist, giving the forest a calm and mysterious feeling.",
  },
  {
    id: "5",
    title: "Desert dunes",
    description:
      "Soft sand dunes stretch into the distance, shaped by the wind under a clear sky.",
  },
  {
    id: "6",
    title: "Snowy cabin",
    description:
      "A small wooden cabin sits in deep snow, with smoke rising from its chimney.",
  },
];

export function getPhotoById(id: string) {
  return photos.find((photo) => photo.id === id);
}

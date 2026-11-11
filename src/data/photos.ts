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
  {
    id: "7",
    title: "Lighthouse in the storm",
    description:
      "Waves crash against the rocks below a lone lighthouse while dark clouds roll overhead.",
  },
  {
    id: "8",
    title: "Golden wheat field",
    description:
      "Tall stalks of wheat glow in the late afternoon sun, swaying gently in the breeze.",
  },
  {
    id: "9",
    title: "Misty lake at dawn",
    description:
      "A thin layer of fog drifts over still water as the first colors of morning appear.",
  },
  {
    id: "10",
    title: "Neon alleyway",
    description:
      "Colorful signs reflect on wet pavement in a narrow city alley after the rain.",
  },
  {
    id: "11",
    title: "Autumn forest path",
    description:
      "Red and orange leaves cover a quiet trail that winds between tall trees.",
  },
  {
    id: "12",
    title: "Starry desert sky",
    description:
      "The Milky Way stretches across a clear night sky above dark, rolling dunes.",
  },
  {
    id: "13",
    title: "Waves on black sand",
    description:
      "White foam spreads across a dark volcanic beach as the tide rolls in.",
  },
  {
    id: "14",
    title: "Old cobblestone street",
    description:
      "Warm lamps light a narrow street lined with weathered stone buildings.",
  },
  {
    id: "15",
    title: "Frozen waterfall",
    description:
      "Icicles hang from a cliff where a waterfall has frozen solid in the winter cold.",
  },
  {
    id: "16",
    title: "Sailboat on turquoise water",
    description:
      "A small white sailboat drifts across calm, brightly colored tropical water.",
  },
  {
    id: "17",
    title: "Cherry blossoms in spring",
    description:
      "Pink petals fill the branches of a tree, with a few falling softly to the ground.",
  },
  {
    id: "18",
    title: "Northern lights over the mountains",
    description:
      "Green and purple ribbons of light dance above a snowy mountain range.",
  },
];

export function getPhotoById(id: string) {
  return photos.find((photo) => photo.id === id);
}

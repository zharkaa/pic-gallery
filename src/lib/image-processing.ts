// Browser-side image preparation for the private `photos` bucket.
//
// Re-encoding through a canvas is what strips EXIF/GPS/device metadata: the
// browser decodes the pixels and writes a fresh file. Animated GIFs are kept
// as-is (re-encoding would drop the animation), and the upload Edge Function
// rejects GIFs that still contain comment/XMP blocks.
//
// This is a UX/performance step only. The Edge Function validates everything
// again on the server, so a modified client cannot bypass it.

import { UserVisibleError } from "@/lib/errors";

const THUMBNAIL_MAX_EDGE = 800;
const THUMBNAIL_QUALITY = 0.75;

const ORIGINAL_MAX_EDGE = 2560;
const ORIGINAL_QUALITY = 0.85;

// Mirrors the server cap in supabase/functions/upload-photo/index.ts, except for
// the pixel ceiling: the browser has to decode the whole image into memory, so
// 30 MP is as much as a phone tab can hold. The server's 50 MP limit only guards
// a header parse, so it can stay higher.
const MAX_PIXELS = 30_000_000;
const MAX_EDGE = 8192;

export type PreparedUpload = {
  original: File;
  thumbnail: File | null;
};

/** A problem with the selected file; the message is safe to show to the user. */
export class ImageProcessingError extends UserVisibleError {
  constructor(message: string) {
    super(message);
    this.name = "ImageProcessingError";
  }
}

const EXTENSION_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

function extensionFor(type: string) {
  return EXTENSION_BY_TYPE[type] ?? "webp";
}

function fitWithin(width: number, height: number, maxEdge: number) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { width, height };

  const scale = maxEdge / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function encodeCanvas(
  bitmap: ImageBitmap,
  maxEdge: number,
  type: string,
  quality: number,
): Promise<Blob> {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas is not available."));

  // A white matte prevents transparent PNGs from turning black in JPEG.
  if (type !== "image/webp" && type !== "image/png" && type !== "image/avif") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(bitmap, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the image."))),
      type,
      quality,
    );
  });
}

async function makeThumbnail(bitmap: ImageBitmap): Promise<File | null> {
  try {
    const blob = await encodeCanvas(bitmap, THUMBNAIL_MAX_EDGE, "image/webp", THUMBNAIL_QUALITY);
    const type = blob.type || "image/webp";
    return new File([blob], `thumbnail.${extensionFor(type)}`, { type });
  } catch {
    // Some browsers cannot encode a format; the original still uploads.
    return null;
  }
}

async function decode(file: Blob) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageProcessingError(
      "We could not read that image. Try a JPEG, PNG, WebP, or GIF.",
    );
  }
}

/**
 * Decode once, then always re-encode the photo (stripping metadata) and return
 * a small grid thumbnail. Animated GIFs stay untouched so they keep animating.
 */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  const bitmap = await decode(file);

  try {
    if (
      bitmap.width * bitmap.height > MAX_PIXELS ||
      Math.max(bitmap.width, bitmap.height) > MAX_EDGE
    ) {
      throw new ImageProcessingError(
        "That image is too large in pixels. Resize it and try again.",
      );
    }

    const thumbnail = await makeThumbnail(bitmap);

    if (file.type === "image/gif") {
      return { original: file, thumbnail };
    }

    let blob: Blob;
    try {
      blob = await encodeCanvas(bitmap, ORIGINAL_MAX_EDGE, "image/webp", ORIGINAL_QUALITY);
    } catch {
      throw new ImageProcessingError(
        "We could not prepare that image. Try saving it as a JPEG and uploading again.",
      );
    }

    const type = blob.type || "image/webp";
    return {
      original: new File([blob], `photo.${extensionFor(type)}`, { type }),
      thumbnail,
    };
  } finally {
    bitmap.close();
  }
}

/** Generate a thumbnail for an already-downloaded image (used by the backfill). */
export async function createThumbnailFromBlob(source: Blob): Promise<File | null> {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    return null;
  }

  try {
    return await makeThumbnail(bitmap);
  } finally {
    bitmap.close();
  }
}

// Browser-side image preparation for the private `photos` bucket.
//
// Re-encoding through a canvas also strips EXIF metadata (GPS, device, etc.)
// and lets the gallery serve small thumbnails without a paid image service.

const THUMBNAIL_MAX_EDGE = 800;
const THUMBNAIL_QUALITY = 0.75;

const ORIGINAL_MAX_EDGE = 2560;
const ORIGINAL_QUALITY = 0.85;
const ORIGINAL_RECOMPRESS_THRESHOLD = 2 * 1024 * 1024;

export type PreparedUpload = {
  original: File;
  thumbnail: File | null;
};

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
    // Some browsers cannot decode/encode a format; keep the original only.
    return null;
  }
}

/**
 * Decode once, then return a web-friendly original (when it is large) and a
 * small grid thumbnail. Both fall back to the untouched input on failure.
 */
export async function prepareUpload(file: File): Promise<PreparedUpload> {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return { original: file, thumbnail: null };
  }

  try {
    let original = file;
    const longEdge = Math.max(bitmap.width, bitmap.height);

    // Keep animated GIFs intact; the detail page should still animate.
    if (
      file.type !== "image/gif" &&
      (longEdge > ORIGINAL_MAX_EDGE || file.size > ORIGINAL_RECOMPRESS_THRESHOLD)
    ) {
      try {
        const blob = await encodeCanvas(bitmap, ORIGINAL_MAX_EDGE, "image/webp", ORIGINAL_QUALITY);

        if (blob.size < file.size) {
          const type = blob.type || "image/webp";
          original = new File([blob], `photo.${extensionFor(type)}`, { type });
        }
      } catch {
        // Re-encoding is an optimization; the original is still uploadable.
      }
    }

    return { original, thumbnail: await makeThumbnail(bitmap) };
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

import { createThumbnailFromBlob } from "@/lib/image-processing";
import { UserVisibleError } from "@/lib/errors";
import { supabase } from "@/utils/supabase";

const BUCKET = "photos";
const UPLOAD_FUNCTION = "upload-photo";

// The bucket is private, so every render needs a short-lived signed URL.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Reuse signed URLs until shortly before they expire. Visibility is still
// enforced by the row query, so caching by storage path does not leak drafts.
const SIGNED_URL_CACHE_MS = (SIGNED_URL_TTL_SECONDS - 60) * 1000;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

// Shown only if a row points at a missing object; keeps `<img src>` valid.
const MISSING_IMAGE_SRC =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'/%3E";

export type Photo = {
  id: string;
  title: string;
  description: string;
  storagePath: string;
  thumbnailPath: string | null;
  tags: string[];
  dateTaken: string | null;
  published: boolean;
  ownerId: string;
  createdAt: string;
  /** Short-lived signed URL of the full-size image in the private bucket. */
  src: string;
  /** Small signed URL for grids, falling back to `src` when no thumbnail exists. */
  thumbnailSrc: string;
};

type PhotoRow = {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  thumbnail_path: string | null;
  tags: string[] | null;
  date_taken: string | null;
  published: boolean;
  owner_id: string;
  created_at: string;
};

function toPhoto(row: PhotoRow, src: string, thumbnailSrc: string): Photo {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    storagePath: row.storage_path,
    thumbnailPath: row.thumbnail_path,
    tags: row.tags ?? [],
    dateTaken: row.date_taken,
    published: row.published,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    src,
    thumbnailSrc,
  };
}

/** `grid` signs only what the gallery tiles need; `all` also signs originals. */
type SignMode = "all" | "grid";

/** Resolve signed URLs for a batch of rows, reusing cached URLs when possible. */
async function withSignedUrls(rows: PhotoRow[], mode: SignMode = "all"): Promise<Photo[]> {
  if (rows.length === 0) return [];

  const now = Date.now();
  const signedUrls = new Map<string, string>();
  const pathsToSign = new Set<string>();

  for (const row of rows) {
    const paths =
      mode === "all"
        ? [row.storage_path, ...(row.thumbnail_path ? [row.thumbnail_path] : [])]
        : [row.thumbnail_path ?? row.storage_path];

    for (const path of paths) {
      const cached = signedUrlCache.get(path);

      if (cached && cached.expiresAt > now) {
        signedUrls.set(path, cached.url);
      } else {
        if (cached) signedUrlCache.delete(path);
        pathsToSign.add(path);
      }
    }
  }

  if (pathsToSign.size > 0) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls([...pathsToSign], SIGNED_URL_TTL_SECONDS);

    if (error) throw error;

    const expiresAt = Date.now() + SIGNED_URL_CACHE_MS;

    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl) continue;

      signedUrls.set(item.path, item.signedUrl);
      signedUrlCache.set(item.path, { url: item.signedUrl, expiresAt });
    }
  }

  return rows.map((row) => {
    const originalSrc = signedUrls.get(row.storage_path) ?? MISSING_IMAGE_SRC;
    const thumbnailSrc = row.thumbnail_path
      ? (signedUrls.get(row.thumbnail_path) ?? originalSrc)
      : originalSrc;

    // The gallery only needs the small image; detail/dashboard views need both.
    return mode === "grid"
      ? toPhoto(row, thumbnailSrc, thumbnailSrc)
      : toPhoto(row, originalSrc, thumbnailSrc);
  });
}

async function rowToPhoto(row: PhotoRow): Promise<Photo> {
  const [photo] = await withSignedUrls([row]);
  return photo;
}

/** Published photos, newest first, for the home gallery. */
export async function fetchPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return withSignedUrls((data ?? []) as PhotoRow[], "grid");
}

/** The signed-in user's photos, newest first, including their drafts. */
export async function fetchMyPhotos(userId: string): Promise<Photo[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return withSignedUrls((data ?? []) as PhotoRow[]);
}

/**
 * Fetch one photo by id. RLS limits anonymous visitors to published photos,
 * while the owner can still open a direct link to a draft.
 */
export async function fetchPhotoById(id: string): Promise<Photo | null> {
  const { data, error } = await supabase.from("photos").select("*").eq("id", id).maybeSingle();

  if (error) throw error;

  return data ? rowToPhoto(data as PhotoRow) : null;
}

/** Show or hide a photo in the public gallery. */
export async function updatePhotoPublished(id: string, published: boolean): Promise<Photo> {
  const { data, error } = await supabase
    .from("photos")
    .update({ published })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return rowToPhoto(data as PhotoRow);
}

/** Permanently delete a photo's image files and its metadata row. */
export async function deletePhoto(photo: Photo): Promise<void> {
  // Remove the files first. If cleanup fails, the row still exists and the
  // caller can retry instead of leaving orphaned objects behind.
  const paths = [photo.storagePath, photo.thumbnailPath].filter(
    (path): path is string => Boolean(path),
  );

  const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);

  if (storageError) throw storageError;

  const { error } = await supabase.from("photos").delete().eq("id", photo.id);

  if (error) throw error;
}

export type PhotoDetails = {
  title: string;
  description: string;
  dateTaken: string | null;
  tags: string[];
};

/** Update the editable metadata of an existing photo. */
export async function updatePhotoDetails(id: string, details: PhotoDetails): Promise<Photo> {
  const { data, error } = await supabase
    .from("photos")
    .update({
      title: details.title,
      description: details.description,
      date_taken: details.dateTaken,
      tags: details.tags,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  return rowToPhoto(data as PhotoRow);
}

export type NewPhoto = {
  id: string;
  title: string;
  description: string;
  dateTaken: string | null;
  tags: string[];
  published: boolean;
};

function assertPhotoResponse(data: unknown): PhotoRow {
  if (typeof data === "object" && data !== null && "photo" in data) {
    const photo = (data as { photo: unknown }).photo;
    if (typeof photo === "object" && photo !== null) return photo as PhotoRow;
  }

  throw new UserVisibleError("The server did not confirm the upload. Please check your gallery.");
}

/**
 * Send the prepared file to the `upload-photo` Edge Function. The function
 * validates the bytes, enforces the quota/rate limit, and writes the objects
 * and metadata row with the service role.
 */
export async function uploadPhoto(
  file: File,
  thumbnail: File | null,
  photo: NewPhoto,
): Promise<void> {
  const body = new FormData();
  body.set("mode", "upload");
  body.set("id", photo.id);
  body.set("file", file);
  if (thumbnail) body.set("thumbnail", thumbnail);
  body.set(
    "metadata",
    JSON.stringify({
      title: photo.title,
      description: photo.description,
      dateTaken: photo.dateTaken,
      tags: photo.tags,
      published: photo.published,
    }),
  );

  const { data, error } = await supabase.functions.invoke(UPLOAD_FUNCTION, { body });
  if (error) throw error;

  assertPhotoResponse(data);
}

/** Upload a generated thumbnail for an existing owned photo. */
async function uploadThumbnail(photoId: string, thumbnail: File): Promise<Photo> {
  const body = new FormData();
  body.set("mode", "thumbnail");
  body.set("photoId", photoId);
  body.set("thumbnail", thumbnail);

  const { data, error } = await supabase.functions.invoke(UPLOAD_FUNCTION, { body });
  if (error) throw error;

  return rowToPhoto(assertPhotoResponse(data));
}

/**
 * Generate a thumbnail for an existing photo and store it in the owner's
 * folder. Used by the dashboard backfill for photos uploaded before thumbnails.
 */
export async function optimizePhotoThumbnail(photo: Photo): Promise<Photo> {
  // Download with the current session so a long backfill cannot reuse an
  // expired signed URL.
  const { data, error: downloadError } = await supabase.storage
    .from(BUCKET)
    .download(photo.storagePath);

  if (downloadError) throw downloadError;

  const thumbnail = await createThumbnailFromBlob(data);

  if (!thumbnail) {
    throw new UserVisibleError(
      `We could not resize “${photo.title}” in this browser. Try a different photo.`,
    );
  }

  return uploadThumbnail(photo.id, thumbnail);
}

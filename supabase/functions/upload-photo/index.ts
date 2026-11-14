// Server-side upload pipeline for the gallery (§1.1-§1.3, §1.5).
//
// The browser validates files for UX and re-encodes them, but this function is
// the security boundary:
//
//   * only an authenticated user can upload, and only into their own folder;
//   * the real image format is read from the magic bytes (not the declared
//     Content-Type), the pixel dimensions are capped, and files that still
//     carry EXIF/XMP/IPTC/comments are rejected;
//   * the per-user photo/byte quota and hourly upload rate limit are enforced
//     (with a database trigger as a backstop);
//   * objects are written with the service role, so the browser no longer needs
//     a storage INSERT policy.
//
// The client never sees a raw database/storage error: failures use stable codes
// that `src/lib/errors.ts` turns into friendly copy.
//
// Keep the numeric limits in sync with
// `supabase/migrations/20261114000000_harden_photo_uploads.sql`.

import { createClient } from "npm:@supabase/supabase-js@2.119.0";

import { ImageValidationError, inspectImage, type InspectedImage } from "./image.ts";

const BUCKET = "photos";

const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_THUMBNAIL_BYTES = 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const MAX_EDGE = 8192;
const MAX_THUMBNAIL_EDGE = 2000;

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

type PhotoMetadata = {
  title: string;
  description: string;
  dateTaken: string | null;
  tags: string[];
  published: boolean;
};

type ValidatedFile = {
  image: InspectedImage;
  size: number;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function createAdminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    console.error("[upload-photo] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing");
    throw new HttpError(500, "server_misconfigured");
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMetadata(raw: FormDataEntryValue | null): PhotoMetadata {
  if (typeof raw !== "string") throw new HttpError(400, "invalid_metadata");

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_metadata");
  }

  if (!isRecord(value)) throw new HttpError(400, "invalid_metadata");

  const title = typeof value.title === "string" ? value.title.trim() : "";
  if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
    throw new HttpError(400, "invalid_metadata");
  }

  const description = value.description ?? "";
  if (typeof description !== "string" || description.length > MAX_DESCRIPTION_LENGTH) {
    throw new HttpError(400, "invalid_metadata");
  }

  const dateTaken = value.dateTaken === "" ? null : (value.dateTaken ?? null);
  if (dateTaken !== null) {
    if (typeof dateTaken !== "string" || !isValidPastDate(dateTaken)) {
      throw new HttpError(400, "invalid_metadata");
    }
  }

  const tags = value.tags ?? [];
  if (!Array.isArray(tags)) throw new HttpError(400, "invalid_metadata");

  const normalizedTags: string[] = [];
  for (const tag of tags) {
    if (typeof tag !== "string") throw new HttpError(400, "invalid_metadata");

    const normalized = tag.trim();
    if (normalized.length < 1 || normalized.length > MAX_TAG_LENGTH) {
      throw new HttpError(400, "invalid_metadata");
    }

    if (!normalizedTags.includes(normalized)) normalizedTags.push(normalized);
  }

  if (normalizedTags.length > MAX_TAGS) throw new HttpError(400, "invalid_metadata");

  if (typeof value.published !== "boolean") throw new HttpError(400, "invalid_metadata");

  return {
    title,
    description,
    dateTaken,
    tags: normalizedTags,
    published: value.published,
  };
}

/**
 * `YYYY-MM-DD`, a real calendar date, and not beyond "today" anywhere on Earth.
 *
 * The browser picker uses the visitor's local date while the database uses UTC,
 * so a plain UTC comparison rejects a UTC+9 visitor's "today" every morning.
 * Accepting up to the latest local date in any timezone (UTC+14) matches the
 * `date_taken <= current_date + 1` constraint in the migration.
 */
const MAX_TIMEZONE_OFFSET_MS = 14 * 60 * 60 * 1000;

function isValidPastDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  if (parsed.toISOString().slice(0, 10) !== value) return false;

  const latestLocalDate = new Date(Date.now() + MAX_TIMEZONE_OFFSET_MS)
    .toISOString()
    .slice(0, 10);

  return value <= latestLocalDate;
}

async function validateImage(
  entry: FormDataEntryValue | null,
  options: { maxBytes: number; maxEdge: number; label: "original" | "thumbnail" },
): Promise<ValidatedFile | null> {
  if (entry === null) return null;
  if (!(entry instanceof File)) throw new HttpError(400, "invalid_image");

  if (entry.size === 0) throw new HttpError(400, "invalid_image");
  if (entry.size > options.maxBytes) {
    throw new HttpError(413, options.label === "original" ? "image_too_large" : "invalid_thumbnail");
  }

  let image: InspectedImage;
  try {
    image = inspectImage(new Uint8Array(await entry.arrayBuffer()));
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw new HttpError(400, error.code);
    }

    throw error;
  }

  if (image.width * image.height > MAX_PIXELS || Math.max(image.width, image.height) > options.maxEdge) {
    throw new HttpError(400, "image_dimensions");
  }

  if (options.label === "thumbnail" && image.extension !== "webp" && image.extension !== "png") {
    throw new HttpError(400, "invalid_thumbnail");
  }

  return { image, size: entry.size };
}

function limitStatusToError(status: unknown) {
  switch (status) {
    case "rate_limited":
      return new HttpError(429, "rate_limited");
    case "photo_quota_exceeded":
      return new HttpError(409, "photo_quota_exceeded");
    case "storage_quota_exceeded":
      return new HttpError(413, "storage_quota_exceeded");
    case "invalid_size":
      return new HttpError(400, "invalid_size");
    default:
      return new HttpError(500, "upload_failed");
  }
}

async function removeObjects(admin: ReturnType<typeof createAdminClient>, paths: string[]) {
  if (paths.length === 0) return;

  const { error } = await admin.storage.from(BUCKET).remove(paths);
  if (error) console.error("[upload-photo] could not clean up uploaded objects", error);
}

async function handleUpload(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  form: FormData,
) {
  const id = form.get("id");
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    throw new HttpError(400, "invalid_request");
  }

  const metadata = parseMetadata(form.get("metadata"));
  const original = await validateImage(form.get("file"), {
    maxBytes: MAX_ORIGINAL_BYTES,
    maxEdge: MAX_EDGE,
    label: "original",
  });

  if (!original) throw new HttpError(400, "invalid_image");

  const thumbnail = await validateImage(form.get("thumbnail"), {
    maxBytes: MAX_THUMBNAIL_BYTES,
    maxEdge: MAX_THUMBNAIL_EDGE,
    label: "thumbnail",
  });

  const totalBytes = original.size + (thumbnail?.size ?? 0);
  const { data: limitStatus, error: limitError } = await admin.rpc("photo_upload_limit_status", {
    p_user_id: userId,
    p_bytes: totalBytes,
  });

  if (limitError) {
    console.error("[upload-photo] quota check failed", limitError);
    throw new HttpError(500, "upload_failed");
  }

  if (limitStatus !== "ok") throw limitStatusToError(limitStatus);

  const storagePath = `${userId}/${id}.${original.image.extension}`;
  let thumbnailPath = thumbnail ? `${userId}/thumbs/${id}.${thumbnail.image.extension}` : null;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, form.get("file") as File, {
      cacheControl: "3600",
      contentType: original.image.mime,
      upsert: false,
    });

  if (uploadError) {
    console.error("[upload-photo] original upload failed", uploadError);
    throw new HttpError(500, "upload_failed");
  }

  if (thumbnail && thumbnailPath) {
    const { error: thumbnailError } = await admin.storage
      .from(BUCKET)
      .upload(thumbnailPath, form.get("thumbnail") as File, {
        cacheControl: "3600",
        contentType: thumbnail.image.mime,
        upsert: false,
      });

    if (thumbnailError) {
      // Not fatal: the gallery still works without a thumbnail.
      console.error("[upload-photo] thumbnail upload failed", thumbnailError);
      thumbnailPath = null;
    }
  }

  const { data: inserted, error: insertError } = await admin
    .from("photos")
    .insert({
      owner_id: userId,
      title: metadata.title,
      description: metadata.description,
      storage_path: storagePath,
      thumbnail_path: thumbnailPath,
      tags: metadata.tags,
      date_taken: metadata.dateTaken,
      published: metadata.published,
      size_bytes: totalBytes,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[upload-photo] metadata insert failed", insertError);
    await removeObjects(admin, [storagePath, ...(thumbnailPath ? [thumbnailPath] : [])]);

    if (insertError.code === "P0001" && typeof insertError.message === "string") {
      throw limitStatusToError(insertError.message);
    }

    throw new HttpError(500, "upload_failed");
  }

  return json({ photo: { id: inserted.id } }, 201);
}

async function handleThumbnail(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  form: FormData,
) {
  const photoId = form.get("photoId");
  if (typeof photoId !== "string" || !UUID_PATTERN.test(photoId)) {
    throw new HttpError(400, "invalid_request");
  }

  const thumbnail = await validateImage(form.get("thumbnail"), {
    maxBytes: MAX_THUMBNAIL_BYTES,
    maxEdge: MAX_THUMBNAIL_EDGE,
    label: "thumbnail",
  });

  if (!thumbnail) throw new HttpError(400, "invalid_thumbnail");

  const { data: row, error: lookupError } = await admin
    .from("photos")
    .select("id, owner_id, thumbnail_path, size_bytes")
    .eq("id", photoId)
    .maybeSingle();

  if (lookupError) {
    console.error("[upload-photo] thumbnail lookup failed", lookupError);
    throw new HttpError(500, "upload_failed");
  }

  if (!row || row.owner_id !== userId) throw new HttpError(404, "photo_not_found");

  const thumbnailPath = `${userId}/thumbs/${photoId}.${thumbnail.image.extension}`;

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(thumbnailPath, form.get("thumbnail") as File, {
      cacheControl: "3600",
      contentType: thumbnail.image.mime,
      upsert: true,
    });

  if (uploadError) {
    console.error("[upload-photo] thumbnail upload failed", uploadError);
    throw new HttpError(500, "upload_failed");
  }

  const { data: updated, error: updateError } = await admin
    .from("photos")
    .update({
      thumbnail_path: thumbnailPath,
      size_bytes: Number(row.size_bytes ?? 0) + thumbnail.size,
    })
    .eq("id", photoId)
    .select("*")
    .single();

  if (updateError) {
    console.error("[upload-photo] thumbnail row update failed", updateError);
    // Only remove the new object if it did not overwrite an existing one.
    if (row.thumbnail_path !== thumbnailPath) await removeObjects(admin, [thumbnailPath]);
    throw new HttpError(500, "upload_failed");
  }

  if (row.thumbnail_path && row.thumbnail_path !== thumbnailPath) {
    await removeObjects(admin, [row.thumbnail_path]);
  }

  return json({ photo: updated }, 200);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const admin = createAdminClient();

    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) throw new HttpError(401, "unauthorized");

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) throw new HttpError(401, "unauthorized");

    const form = await request.formData();
    const mode = form.get("mode") ?? "upload";

    if (mode === "upload") {
      return await handleUpload(admin, userData.user.id, form);
    }

    if (mode === "thumbnail") {
      return await handleThumbnail(admin, userData.user.id, form);
    }

    throw new HttpError(400, "invalid_request");
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.code }, error.status);
    }

    console.error("[upload-photo] unexpected error", error);
    return json({ error: "upload_failed" }, 500);
  }
});

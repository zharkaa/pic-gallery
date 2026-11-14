// Friendly error copy for every Supabase failure the UI can show.
//
// Supabase errors contain table names, policy names, constraint details, and
// storage internals. Those are useful in the console but must never be rendered
// in the UI, so every `catch` should log the real error with `logError` and show
// the result of `toFriendlyMessage` instead.

import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  PostgrestError,
} from "@supabase/supabase-js";

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/** An error whose message was written for users and can be rendered as-is. */
export class UserVisibleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserVisibleError";
  }
}

/** Stable codes returned by `supabase/functions/upload-photo/index.ts`. */
const UPLOAD_MESSAGES: Record<string, string> = {
  unauthorized: "Your session has expired. Sign in again and retry.",
  invalid_request: "The upload request was invalid. Please try again.",
  invalid_metadata:
    "Some photo details are invalid. Check the title, description, tags, and date.",
  invalid_image: "That file is not a valid image.",
  unsupported_type: "Choose a JPEG, PNG, WebP, or GIF image.",
  metadata_not_allowed:
    "That image still contains EXIF/GPS metadata. Re-save it and try again.",
  image_too_large: "That image is larger than 10 MB.",
  image_dimensions: "That image is too large in pixels. Resize it and try again.",
  invalid_thumbnail: "The thumbnail could not be uploaded. Please try again.",
  photo_not_found: "That photo no longer exists.",
  photo_quota_exceeded: "You have reached the limit of 500 photos.",
  storage_quota_exceeded: "This upload would exceed your 800 MB storage limit.",
  rate_limited: "Too many uploads in a short time. Wait a few minutes and try again.",
  upload_failed: "The server could not save the photo. Please try again.",
  server_misconfigured: "Uploads are not configured on the server yet.",
};

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "Incorrect email or password.",
  user_not_found: "Incorrect email or password.",
  email_not_confirmed: "Confirm your email address before signing in.",
  over_request_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  over_email_send_rate_limit: "Too many attempts. Wait a few minutes and try again.",
  session_expired: "Your session has expired. Sign in again.",
  weak_password: "Choose a longer, stronger password.",
  same_password: "Choose a password you have not used before.",
};

const POSTGRES_MESSAGES: Record<string, string> = {
  "23514": "Some photo details are invalid. Check the title, description, tags, and date.",
  "23503": "That action references something that no longer exists. Refresh and try again.",
  "42501": "You do not have permission to do that.",
};

type ErrorRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ErrorRecord {
  return typeof value === "object" && value !== null;
}

/** Log the real error; its details are for developers, not for the UI. */
export function logError(context: string, error: unknown) {
  console.error(`[${context}]`, error);
}

function isPostgrestError(error: unknown): error is PostgrestError {
  return (
    error instanceof PostgrestError ||
    (isRecord(error) &&
      typeof error.message === "string" &&
      typeof error.code === "string" &&
      ("details" in error || "hint" in error))
  );
}

function isAuthError(error: unknown): error is ErrorRecord & { message: string } {
  return (
    isRecord(error) &&
    typeof error.message === "string" &&
    (error.__isAuthError === true ||
      error.name === "AuthApiError" ||
      error.name === "AuthRetryableFetchError")
  );
}

function isStorageError(error: unknown): error is ErrorRecord & { message: string } {
  return (
    isRecord(error) &&
    typeof error.message === "string" &&
    (error.__isStorageError === true || error.name === "StorageApiError")
  );
}

async function readFunctionErrorCode(error: FunctionsHttpError) {
  const response = error.context as Response | undefined;
  if (!response) return null;

  // The platform rejects expired tokens and oversized bodies before the
  // function runs, so those responses have no `{ error }` code.
  if (response.status === 401) return "unauthorized";
  if (response.status === 413) return "image_too_large";

  if (!response.body) return null;

  try {
    const body: unknown = await response.clone().json();
    if (isRecord(body) && typeof body.error === "string") return body.error;
  } catch {
    // Not JSON (e.g. a gateway error); fall through to the generic message.
  }

  return null;
}

function fromPostgres(error: PostgrestError): string | null {
  if (error.code === "P0001") {
    // The upload-limit trigger raises a stable status string as its message.
    return UPLOAD_MESSAGES[error.message] ?? null;
  }

  if (error.code === "PGRST116") return "That item could not be found.";

  return POSTGRES_MESSAGES[error.code] ?? null;
}

function fromAuth(error: ErrorRecord & { message: string }): string | null {
  const code = typeof error.code === "string" ? error.code : null;
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];

  // Older auth servers only send the human-readable message.
  const message = error.message.toLowerCase();
  if (message.includes("invalid login credentials")) return AUTH_MESSAGES.invalid_credentials;
  if (message.includes("email not confirmed")) return AUTH_MESSAGES.email_not_confirmed;
  if (message.includes("rate limit")) return AUTH_MESSAGES.over_request_rate_limit;

  return null;
}

function fromStorage(error: ErrorRecord & { message: string }): string | null {
  const message = error.message.toLowerCase();

  if (message.includes("payload too large") || message.includes("file size")) {
    return UPLOAD_MESSAGES.image_too_large;
  }

  if (message.includes("mime type")) return UPLOAD_MESSAGES.unsupported_type;
  if (message.includes("row-level security") || message.includes("permission")) {
    return POSTGRES_MESSAGES["42501"];
  }
  if (message.includes("not found")) return "That file could not be found.";

  return null;
}

/**
 * Turn any Supabase/network error into copy that is safe to render.
 * The real error still needs to be logged by the caller.
 */
export async function toFriendlyMessage(
  error: unknown,
  fallback: string = GENERIC_MESSAGE,
): Promise<string> {
  if (error instanceof UserVisibleError) return error.message;

  if (error instanceof FunctionsHttpError) {
    const code = await readFunctionErrorCode(error);
    return (code && UPLOAD_MESSAGES[code]) || fallback;
  }

  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return "We could not reach the server. Check your connection and try again.";
  }

  if (isPostgrestError(error)) {
    return fromPostgres(error) ?? fallback;
  }

  if (isAuthError(error)) {
    return fromAuth(error) ?? fallback;
  }

  if (isStorageError(error)) {
    return fromStorage(error) ?? fallback;
  }

  if (error instanceof TypeError) {
    return "We could not reach the server. Check your connection and try again.";
  }

  return fallback;
}

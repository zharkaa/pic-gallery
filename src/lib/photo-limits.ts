// Client-side mirrors of the database limits in
// `supabase/migrations/20261114000000_harden_photo_uploads.sql` and the upload
// Edge Function. They exist so the form can stop bad input before a request;
// the database remains the authority.

export const PHOTO_TITLE_MAX_LENGTH = 200;
export const PHOTO_DESCRIPTION_MAX_LENGTH = 5000;
export const PHOTO_TAGS_MAX = 20;
export const PHOTO_TAG_MAX_LENGTH = 50;

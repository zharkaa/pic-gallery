import { supabase } from "@/utils/supabase";

const BUCKET = "photos";

export type Photo = {
  id: string;
  title: string;
  description: string;
  storagePath: string;
  tags: string[];
  dateTaken: string | null;
  published: boolean;
  createdAt: string;
  /** Public URL of the image inside the `photos` storage bucket. */
  src: string;
};

type PhotoRow = {
  id: string;
  title: string;
  description: string | null;
  storage_path: string;
  tags: string[] | null;
  date_taken: string | null;
  published: boolean;
  created_at: string;
};

function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    storagePath: row.storage_path,
    tags: row.tags ?? [],
    dateTaken: row.date_taken,
    published: row.published,
    createdAt: row.created_at,
    src: supabase.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl,
  };
}

/** Published photos, newest first, for the home gallery. */
export async function fetchPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase
    .from("photos")
    .select("*")
    .eq("published", true)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => toPhoto(row as PhotoRow));
}

/** Every photo, newest first, including drafts hidden from the gallery. */
export async function fetchAllPhotos(): Promise<Photo[]> {
  const { data, error } = await supabase.from("photos").select("*").order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row) => toPhoto(row as PhotoRow));
}

/** Fetch one photo by id, including drafts (a direct link should still work). */
export async function fetchPhotoById(id: string): Promise<Photo | null> {
  const { data, error } = await supabase.from("photos").select("*").eq("id", id).maybeSingle();

  if (error) throw error;

  return data ? toPhoto(data as PhotoRow) : null;
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

  return toPhoto(data as PhotoRow);
}

/** Permanently delete a photo's metadata row and its image file. */
export async function deletePhoto(photo: Photo): Promise<void> {
  const { error } = await supabase.from("photos").delete().eq("id", photo.id);

  if (error) throw error;

  // The row is already gone, so a failed file cleanup shouldn't make the UI
  // report the photo as still existing. Supabase removes the object best-effort.
  await supabase.storage.from(BUCKET).remove([photo.storagePath]);
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

  return toPhoto(data as PhotoRow);
}

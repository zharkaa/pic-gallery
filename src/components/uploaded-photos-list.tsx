import { useState } from "react";
import { EllipsisVertical, Eye, EyeOff, ImageOff, Loader2, Trash2 } from "lucide-react";
import { cn } from "cn";

import { SkeletonImage } from "@/components/skeleton-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast-manager";
import { Skeleton } from "@/components/ui/skeleton";
import { deletePhoto, updatePhotoPublished, type Photo } from "@/data/photos";

type UploadedPhotosListProps = {
  photos: Photo[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
  onPhotoUpdated: (photo: Photo) => void;
  onPhotoDeleted: (id: string) => void;
};

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type UploadedPhotoCardProps = {
  photo: Photo;
  onPhotoUpdated: (photo: Photo) => void;
  onPhotoDeleted: (id: string) => void;
};

/** One non-clickable card with menus for publishing, hiding, and deleting the photo. */
function UploadedPhotoCard({ photo, onPhotoUpdated, onPhotoDeleted }: UploadedPhotoCardProps) {
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const nextPublished = !photo.published;

  async function handleTogglePublished() {
    if (isSaving) return;

    setIsSaving(true);

    try {
      const updated = await updatePhotoPublished(photo.id, nextPublished);
      onPhotoUpdated(updated);
      toast.add({
        title: updated.published ? "Photo published" : "Photo hidden",
        description: updated.published
          ? "It now appears in the public gallery."
          : "It is now hidden from the public gallery.",
        type: "success",
      });
    } catch (updateError) {
      toast.add({
        title: "Could not update the photo",
        description:
          updateError instanceof Error ? updateError.message : "Please try again.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (isDeleting) return;

    setIsDeleting(true);

    try {
      await deletePhoto(photo);
      setIsDeleteOpen(false);
      onPhotoDeleted(photo.id);
      toast.add({
        title: "Photo deleted",
        description: "The photo and its image file were removed.",
        type: "success",
      });
    } catch (deleteError) {
      toast.add({
        title: "Could not delete the photo",
        description: deleteError instanceof Error ? deleteError.message : "Please try again.",
        type: "error",
      });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <SkeletonImage
          src={photo.src}
          alt={photo.title}
          loading="lazy"
          className="h-full w-full object-cover"
        />

        <span
          className={cn(
            "absolute top-2 left-2 rounded-md border px-1.5 py-0.5 text-xs font-medium shadow-sm backdrop-blur",
            photo.published
              ? "border-emerald-600/30 bg-emerald-50/90 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-400"
              : "border-border bg-background/90 text-muted-foreground",
          )}
        >
          {photo.published ? "Published" : "Hidden"}
        </span>

        <div className="absolute top-2 right-2">
          <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="destructive"
                  size="icon-sm"
                  aria-label={`Delete ${photo.title}`}
                  className="bg-red-600 text-white shadow-md ring-1 ring-white/40 hover:bg-red-700 focus-visible:ring-white dark:bg-red-600 dark:ring-black/30 dark:hover:bg-red-500 dark:focus-visible:ring-black/50"
                />
              }
            >
              <Trash2 />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this photo?</DialogTitle>
                <DialogDescription>
                  “{photo.title}” and its image file will be permanently deleted. This cannot be
                  undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose
                  render={<Button type="button" variant="outline" disabled={isDeleting} />}
                >
                  Cancel
                </DialogClose>
                <Button type="button" variant="destructive" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? (
                    <>
                      <Loader2 className="animate-spin" />
                      Deleting…
                    </>
                  ) : (
                    <>
                      <Trash2 />
                      Delete
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 p-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{photo.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatCreatedAt(photo.createdAt)}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label={`Actions for ${photo.title}`}
                className="shrink-0"
              />
            }
          >
            {isSaving ? <Loader2 className="animate-spin" /> : <EllipsisVertical />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={handleTogglePublished}
              disabled={isSaving}
              className="gap-2 py-1.5"
            >
              {photo.published ? <EyeOff /> : <Eye />}
              {photo.published ? "Unpublish" : "Publish"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/** Grid of every uploaded photo, including the drafts hidden from the gallery. */
export function UploadedPhotosList({
  photos,
  isLoading,
  error,
  onRetry,
  onPhotoUpdated,
  onPhotoDeleted,
}: UploadedPhotosListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="overflow-hidden rounded-xl border">
            <Skeleton className="aspect-[4/3] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border p-10 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed p-10 text-center">
        <ImageOff className="size-7 text-muted-foreground" />
        <div>
          <p className="font-medium">No uploads yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use the Upload photo menu to add your first photo.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {photos.map((photo) => (
        <li key={photo.id}>
          <UploadedPhotoCard
            photo={photo}
            onPhotoUpdated={onPhotoUpdated}
            onPhotoDeleted={onPhotoDeleted}
          />
        </li>
      ))}
    </ul>
  );
}

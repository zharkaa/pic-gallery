import { useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Loader2, Pencil, X } from "lucide-react";

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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast-manager";
import { updatePhotoDetails, type Photo } from "@/data/photos";
import { logError, toFriendlyMessage } from "@/lib/errors";
import {
  PHOTO_DESCRIPTION_MAX_LENGTH,
  PHOTO_TAG_MAX_LENGTH,
  PHOTO_TAGS_MAX,
  PHOTO_TITLE_MAX_LENGTH,
} from "@/lib/photo-limits";

type EditPhotoDialogProps = {
  photo: Photo;
  onUpdated: (photo: Photo) => void;
};

function normalizeTag(value: string) {
  return value.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
}

function todayAsInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

export function EditPhotoDialog({ photo, onUpdated }: EditPhotoDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(photo.title);
  const [description, setDescription] = useState(photo.description);
  const [dateTaken, setDateTaken] = useState(photo.dateTaken ?? "");
  const [tags, setTags] = useState<string[]>(photo.tags);
  const [tagDraft, setTagDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const maxDate = todayAsInputValue();

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    // Start each edit from the values currently saved in the database.
    if (nextOpen) {
      setTitle(photo.title);
      setDescription(photo.description);
      setDateTaken(photo.dateTaken ?? "");
      setTags(photo.tags);
      setTagDraft("");
      setError(null);
    }
  }

  function addTag(value: string) {
    const tag = normalizeTag(value);
    if (!tag) return;

    if (tags.length >= PHOTO_TAGS_MAX) {
      setError(`You can add up to ${PHOTO_TAGS_MAX} tags.`);
      return;
    }

    setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagDraft("");
    setError(null);
  }

  function removeTag(tag: string) {
    setTags((prev) => prev.filter((existing) => existing !== tag));
  }

  function handleTagKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(tagDraft);
      return;
    }

    if (event.key === "Backspace" && tagDraft === "" && tags.length > 0) {
      setTags((prev) => prev.slice(0, -1));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Give your photo a title.");
      return;
    }

    if (trimmedTitle.length > PHOTO_TITLE_MAX_LENGTH) {
      setError(`Keep the title under ${PHOTO_TITLE_MAX_LENGTH} characters.`);
      return;
    }

    // Account for a half-typed tag that `onBlur` hasn't committed yet.
    const pendingTag = normalizeTag(tagDraft);
    const nextTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    if (nextTags.length > PHOTO_TAGS_MAX) {
      setError(`You can add up to ${PHOTO_TAGS_MAX} tags.`);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      const updated = await updatePhotoDetails(photo.id, {
        title: trimmedTitle,
        description: description.trim(),
        dateTaken: dateTaken || null,
        tags: nextTags,
      });

      onUpdated(updated);
      setOpen(false);
      toast.add({
        title: "Photo updated",
        description: "The photo details were saved.",
        type: "success",
      });
    } catch (updateError) {
      logError("update photo", updateError);
      setError(await toFriendlyMessage(updateError, "Could not update this photo."));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button variant="secondary" size="sm" className="shadow-sm" />}>
        <Pencil />
        Edit
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit photo</DialogTitle>
            <DialogDescription>Update the details shown on this page.</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="edit-title">Title</FieldLabel>
              <Input
                id="edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isSaving}
                maxLength={PHOTO_TITLE_MAX_LENGTH}
                aria-invalid={!!error}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea
                id="edit-description"
                rows={4}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSaving}
                maxLength={PHOTO_DESCRIPTION_MAX_LENGTH}
                placeholder="Add a description…"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-date-taken">Date taken</FieldLabel>
              <Input
                id="edit-date-taken"
                type="date"
                max={maxDate}
                value={dateTaken}
                onChange={(event) => setDateTaken(event.target.value)}
                disabled={isSaving}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-tags">Tags</FieldLabel>
              <div className="flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-colors has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 dark:bg-input/30">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-secondary py-0.5 pr-1 pl-1.5 text-xs text-secondary-foreground"
                  >
                    {tag}
                    <button
                      type="button"
                      aria-label={`Remove tag ${tag}`}
                      onClick={() => removeTag(tag)}
                      disabled={isSaving}
                      className="rounded-sm opacity-70 transition-opacity hover:opacity-100 disabled:pointer-events-none"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="edit-tags"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag(tagDraft)}
                  disabled={isSaving}
                  maxLength={PHOTO_TAG_MAX_LENGTH}
                  placeholder={tags.length === 0 ? "sunset, ocean" : ""}
                  className="h-5 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <FieldDescription>
                Press Enter or comma to add a tag. Up to {PHOTO_TAGS_MAX} tags.
              </FieldDescription>
            </Field>

            <FieldError>{error}</FieldError>
          </FieldGroup>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={isSaving} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

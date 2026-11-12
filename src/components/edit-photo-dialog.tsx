import { useState } from "react";
import type { FormEvent } from "react";
import { Loader2, Pencil } from "lucide-react";

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
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { updatePhotoDetails, type Photo } from "@/data/photos";

type EditPhotoDialogProps = {
  photo: Photo;
  onUpdated: (photo: Photo) => void;
};

export function EditPhotoDialog({ photo, onUpdated }: EditPhotoDialogProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(photo.title);
  const [description, setDescription] = useState(photo.description);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    // Start each edit from the values currently saved in the database.
    if (nextOpen) {
      setTitle(photo.title);
      setDescription(photo.description);
      setError(null);
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

    setError(null);
    setIsSaving(true);

    try {
      const updated = await updatePhotoDetails(photo.id, {
        title: trimmedTitle,
        description: description.trim(),
      });

      onUpdated(updated);
      setOpen(false);
      toast.add({
        title: "Photo updated",
        description: "The title and description were saved.",
        type: "success",
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error ? updateError.message : "Could not update this photo.",
      );
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
      <DialogContent className="sm:max-w-md">
        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit photo</DialogTitle>
            <DialogDescription>Update the title and description shown on this page.</DialogDescription>
          </DialogHeader>

          <FieldGroup>
            <Field data-invalid={!!error}>
              <FieldLabel htmlFor="edit-title">Title</FieldLabel>
              <Input
                id="edit-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={isSaving}
                aria-invalid={!!error}
                required
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="edit-description">Description</FieldLabel>
              <Textarea
                id="edit-description"
                rows={5}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                disabled={isSaving}
                placeholder="Add a description…"
              />
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

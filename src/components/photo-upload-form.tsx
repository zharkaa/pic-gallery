import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, KeyboardEvent, SubmitEvent } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { cn } from "cn";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DatePicker } from "@/components/date-picker";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/utils/supabase";

// Matches the `photos` storage bucket limits in supabase/migrations.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

// Keep storage keys predictable and avoid trusting the uploaded file name.
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

type FormErrors = {
  image?: string;
  title?: string;
};

function validateFile(file: File): string | undefined {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "Choose a JPEG, PNG, WebP, AVIF, or GIF image.";
  }

  if (file.size > MAX_FILE_SIZE) {
    return "That image is larger than 10 MB.";
  }

  return undefined;
}

function normalizeTag(value: string) {
  return value.trim().replace(/^#/, "").toLowerCase().replace(/\s+/g, "-");
}

function todayAsInputValue() {
  const today = new Date();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${today.getFullYear()}-${month}-${day}`;
}

type PhotoUploadFormProps = {
  className?: string;
  /** Owner of the new photo; also scopes the storage path under their folder. */
  userId: string;
  /** Called after a photo is uploaded and its metadata row is saved. */
  onSaved?: () => void;
};

export function PhotoUploadForm({ className, userId, onSaved }: PhotoUploadFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dateTaken, setDateTaken] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  const [published, setPublished] = useState(true);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Object URL for the local preview; revoked whenever the file changes/unmounts.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const maxDate = todayAsInputValue();

  const selectFile = useCallback((nextFile: File | undefined) => {
    if (!nextFile) return;

    const error = validateFile(nextFile);
    if (error) {
      setErrors((prev) => ({ ...prev, image: error }));
      return;
    }

    setFile(nextFile);
    setErrors((prev) => ({ ...prev, image: undefined }));
    setSaved(false);
    setSubmitError(null);
  }, []);

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    selectFile(event.target.files?.[0]);
    // Allow picking the same file again after removing it.
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  function addTag(value: string) {
    const tag = normalizeTag(value);
    if (!tag) return;

    setTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    setTagDraft("");
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

  function clearForm() {
    setFile(null);
    setTitle("");
    setDescription("");
    setDateTaken("");
    setTags([]);
    setTagDraft("");
    setPublished(true);
    setErrors({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function resetForm() {
    clearForm();
    setSaved(false);
    setSubmitError(null);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSaving) return;

    const pendingTag = normalizeTag(tagDraft);
    const nextTags = pendingTag && !tags.includes(pendingTag) ? [...tags, pendingTag] : tags;

    const nextErrors: FormErrors = {};
    if (!file) nextErrors.image = "Add a photo before saving.";
    if (!title.trim()) nextErrors.title = "Give your photo a title.";

    setErrors(nextErrors);
    if (nextErrors.image || nextErrors.title) return;

    const selectedFile = file;
    if (!selectedFile) return;

    setIsSaving(true);
    setSaved(false);
    setSubmitError(null);

    const extension = EXTENSIONS[selectedFile.type] ?? "jpg";
    // Storage RLS only allows the user to write inside their own folder.
    const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;

    // 1. Upload the image bytes to the private `photos` bucket.
    const { error: uploadError } = await supabase.storage
      .from("photos")
      .upload(storagePath, selectedFile, {
        cacheControl: "300",
        contentType: selectedFile.type,
        upsert: false,
      });

    if (uploadError) {
      setSubmitError(uploadError.message);
      setIsSaving(false);
      return;
    }

    // 2. Insert the metadata row that points at the uploaded object.
    const { error: insertError } = await supabase.from("photos").insert({
      title: title.trim(),
      description: description.trim(),
      storage_path: storagePath,
      tags: nextTags,
      date_taken: dateTaken || null,
      published,
      owner_id: userId,
    });

    if (insertError) {
      // Don't leave an orphaned file behind if the row could not be created.
      await supabase.storage.from("photos").remove([storagePath]);
      setSubmitError(insertError.message);
      setIsSaving(false);
      return;
    }

    setIsSaving(false);
    clearForm();
    setSaved(true);
    onSaved?.();
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className={cn("grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start", className)}
    >
      {/* Left: image dropzone / preview. */}
      <div className="flex flex-col gap-2">
        {previewUrl ? (
          <div className="relative flex min-h-[320px] overflow-hidden rounded-xl border bg-muted lg:min-h-[480px]">
            <img
              src={previewUrl}
              alt="Selected photo preview"
              className="absolute inset-0 h-full w-full object-contain"
            />
            <div className="absolute top-3 right-3 flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="icon-sm"
                aria-label="Remove selected photo"
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              >
                <X />
              </Button>
            </div>
          </div>
        ) : (
          <label
            htmlFor="photo-file"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "flex min-h-[320px] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/30 p-6 text-center transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none lg:min-h-[480px]",
              isDragging ? "border-primary bg-primary/5" : "border-border",
            )}
          >
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ImagePlus className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">Drag a photo here</p>
            <p className="text-xs text-muted-foreground">or</p>
            <span className="inline-flex h-8 items-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium">
              Browse files
            </span>
            <p className="mt-2 text-xs text-muted-foreground">
              JPEG, PNG, WebP, AVIF, or GIF. Up to 10 MB.
            </p>
          </label>
        )}

        <input
          ref={fileInputRef}
          id="photo-file"
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleFileInputChange}
          className="sr-only"
        />

        <FieldError>{errors.image}</FieldError>
      </div>

      {/* Right: metadata form. */}
      <Card>
        <CardHeader>
          <CardTitle>Photo details</CardTitle>
          <CardDescription>Add a title and any extra details for this photo.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {saved && (
            <div
              role="status"
              className="rounded-lg border border-emerald-600/30 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400"
            >
              Photo saved.
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              Could not save the photo: {submitError}
            </div>
          )}

          <FieldGroup>
            <Field data-invalid={!!errors.title}>
              <FieldLabel htmlFor="title">Title</FieldLabel>
              <Input
                id="title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setSaved(false);
                }}
                placeholder="Sunset over the ocean"
                aria-invalid={!!errors.title}
                aria-describedby={errors.title ? "title-error" : undefined}
              />
              <FieldError id="title-error" errors={errors.title ? [{ message: errors.title }] : []} />
            </Field>

            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Textarea
                id="description"
                rows={5}
                value={description}
                onChange={(event) => {
                  setDescription(event.target.value);
                  setSaved(false);
                }}
                placeholder="Where was it taken? What makes it interesting?"
              />
              <FieldDescription>Optional. Shows below the title on the photo page.</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="tags">Tags</FieldLabel>
              <div
                className={cn(
                  "flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-colors has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50 dark:bg-input/30",
                )}
              >
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
                      className="rounded-sm opacity-70 transition-opacity hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="tags"
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.target.value)}
                  onKeyDown={handleTagKeyDown}
                  onBlur={() => addTag(tagDraft)}
                  placeholder={tags.length === 0 ? "sunset, ocean" : ""}
                  className="h-5 min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
              <FieldDescription>Press Enter or comma to add a tag.</FieldDescription>
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="dateTaken">Date taken</FieldLabel>
                <DatePicker
                  id="dateTaken"
                  max={maxDate}
                  value={dateTaken}
                  onChange={(value) => {
                    setDateTaken(value);
                    setSaved(false);
                  }}
                />
              </Field>

              <Field orientation="horizontal" className="items-center justify-between gap-4 rounded-lg border p-3">
                <div className="flex flex-col gap-0.5">
                  <FieldLabel htmlFor="published">Published</FieldLabel>
                  <FieldDescription>Visible in the public gallery.</FieldDescription>
                </div>
                <Switch
                  id="published"
                  checked={published}
                  onCheckedChange={(checked) => {
                    setPublished(checked);
                    setSaved(false);
                  }}
                />
              </Field>
            </div>
          </FieldGroup>
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button type="button" variant="ghost" onClick={resetForm} disabled={isSaving}>
            Reset
          </Button>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="animate-spin" />
                Saving…
              </>
            ) : (
              "Save photo"
            )}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

import { Loader2 } from "lucide-react";
import { Navigate } from "react-router";

import { PhotoUploadForm } from "@/components/photo-upload-form";
import { useSession } from "@/hooks/use-session";

export default function DashboardPage() {
  const { status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  // Uploading is limited to signed-in users by the database policies, so send
  // everyone else to the login page first.
  if (status === "signed-out") {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Add a photo</h1>
        <p className="text-sm text-muted-foreground">
          Upload an image and fill in the details that appear in the gallery.
        </p>
      </div>

      <PhotoUploadForm />
    </div>
  );
}

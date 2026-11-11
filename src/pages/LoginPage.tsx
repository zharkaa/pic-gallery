import { Navigate } from "react-router";

import { LoginForm } from "@/components/login-form";
import { useSession } from "@/hooks/use-session";

export default function LoginPage() {
  const { status } = useSession();

  // Already signed in (e.g. after a page refresh) — no need to log in again.
  if (status === "signed-in") {
    return <Navigate to="/" replace />;
  }

  return (
    // changed: flex-1 fills the space below the navbar (no viewport calc / 1px overflow)
    <div className="flex w-full flex-1 items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}

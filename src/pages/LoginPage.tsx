import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    // changed: min-h-svh -> calc(100svh-4rem) to subtract navbar; p-24 md:p-10 -> p-4 md:p-10
    <div className="flex min-h-[calc(100svh-4rem)] w-full items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}

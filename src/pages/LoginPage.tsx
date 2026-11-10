import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    // changed: flex-1 fills the space below the navbar (no viewport calc / 1px overflow)
    <div className="flex w-full flex-1 items-center justify-center p-4 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm />
      </div>
    </div>
  );
}

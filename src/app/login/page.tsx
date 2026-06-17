import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { from?: string };
}) {
  // Already signed in → bounce to where they were headed (or home).
  const user = await getSessionUser();
  const from = typeof searchParams.from === "string" ? searchParams.from : "/";
  if (user) {
    redirect(safeRedirect(from));
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <LoginForm from={safeRedirect(from)} />
      </div>
    </div>
  );
}

// Only allow same-origin relative paths to avoid open-redirects.
function safeRedirect(target: string): string {
  if (!target || !target.startsWith("/") || target.startsWith("//")) return "/";
  return target;
}

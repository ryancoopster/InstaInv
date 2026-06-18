import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const dynamic = "force-dynamic";

// Top-level route (outside the (main) layout) so the must-change-password gate in
// that layout can redirect here without looping. Requires an authenticated user.
export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md">
        <ChangePasswordForm forced={user.mustChangePassword} />
      </div>
    </div>
  );
}

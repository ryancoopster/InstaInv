import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";
import { PermissionProvider } from "@/components/shell/permission-context";
import { MobileTopBar } from "@/components/mobile/mobile-topbar";
import { MobileTabBar } from "@/components/mobile/mobile-tabbar";

export const metadata: Metadata = {
  title: "Inventory",
};

// Minimal mobile shell. Lives OUTSIDE the desktop (main) shell.
// Server component: gate on the session, then expose effective permissions to
// client components below via the same PermissionProvider the desktop uses.
export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const perms = effectivePermissions(user);

  return (
    <PermissionProvider value={perms}>
      <div className="flex min-h-screen w-full flex-col bg-background text-foreground">
        <MobileTopBar />
        <main className="flex-1">
          <div className="mx-auto w-full max-w-md px-3 py-4">{children}</div>
        </main>
        <MobileTabBar />
      </div>
    </PermissionProvider>
  );
}

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { effectivePermissions, hasPermission, type PermissionKey } from "@/lib/permissions";
import { NAV_ITEMS } from "@/components/shell/nav";
import { PermissionProvider } from "@/components/shell/permission-context";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar, type TopbarUser } from "@/components/shell/topbar";
import { Forbidden } from "@/components/shell/forbidden";

// Resolve the permission a path requires by longest nav-href prefix match.
function requiredPermissionFor(pathname: string | null): PermissionKey | undefined {
  if (!pathname) return undefined;
  let best: { href: string; permission?: PermissionKey } | undefined;
  for (const item of NAV_ITEMS) {
    if (item.href === "/") continue; // dashboard is always allowed
    if (pathname === item.href || pathname.startsWith(item.href + "/")) {
      if (!best || item.href.length > best.href.length) best = item;
    }
  }
  return best?.permission;
}

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const perms = effectivePermissions(user);

  // Enforce per-route authorization server-side (defense in depth beyond hiding nav links).
  const pathname = headers().get("x-pathname");
  const required = requiredPermissionFor(pathname);
  const denied = required ? !hasPermission(user, required) : false;

  const topbarUser: TopbarUser = {
    name: user.name,
    email: user.email,
    role: user.userType?.name ?? "User",
    image: user.image,
  };

  return (
    <PermissionProvider value={perms}>
      <div className="flex min-h-screen w-full bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={topbarUser} />
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-7xl">
              {denied ? <Forbidden permission={required} /> : children}
            </div>
          </main>
        </div>
      </div>
    </PermissionProvider>
  );
}

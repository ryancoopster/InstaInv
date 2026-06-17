import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/empty-state";
import { ShieldAlert } from "lucide-react";
import { UsersManager } from "@/components/admin/users-manager";
import { serializeUser, serializeRole } from "@/app/api/users/_serialize";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?from=/admin/users");

  if (!hasPermission(user, "users.view")) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No access"
        description="You don't have permission to view users."
      />
    );
  }

  const [users, roles] = await Promise.all([
    prisma.user.findMany({ include: { userType: true }, orderBy: { sortOrder: "asc" } }),
    prisma.userType.findMany({
      orderBy: { sortOrder: "asc" },
      include: { _count: { select: { users: true } } },
    }),
  ]);

  return (
    <UsersManager
      initialUsers={users.map(serializeUser)}
      roles={roles.map(serializeRole)}
      currentUserId={user.id}
    />
  );
}

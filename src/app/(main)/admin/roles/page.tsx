import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
import { EmptyState } from "@/components/ui/empty-state";
import { RolesManager } from "@/components/admin/roles-manager";
import { serializeRole } from "@/app/api/users/_serialize";

export const metadata: Metadata = { title: "Roles" };
export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?from=/admin/roles");

  // Viewing roles is gated on users.view; managing is gated client+server on users.manage.
  if (!hasPermission(user, "users.view")) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="No access"
        description="You don't have permission to view roles."
      />
    );
  }

  const roles = await prisma.userType.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { users: true } } },
  });

  return <RolesManager initialRoles={roles.map(serializeRole)} />;
}

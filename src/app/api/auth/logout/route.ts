import { route, ok } from "@/lib/http";
import { destroySessionCookie, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";

export const POST = route(async () => {
  const user = await getSessionUser();
  destroySessionCookie();
  if (user) {
    // Bump tokenVersion so any other JWTs already issued for this user (e.g. on
    // another device) are immediately invalidated, not just this cookie cleared.
    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    await logActivity({ userId: user.id, action: "auth.logout", entity: "User", entityId: user.id });
  }
  return ok({ success: true });
});

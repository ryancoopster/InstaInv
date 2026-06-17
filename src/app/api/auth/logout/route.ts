import { route, ok } from "@/lib/http";
import { destroySessionCookie, getSessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

export const POST = route(async () => {
  const user = await getSessionUser();
  destroySessionCookie();
  if (user) {
    await logActivity({ userId: user.id, action: "auth.logout", entity: "User", entityId: user.id });
  }
  return ok({ success: true });
});

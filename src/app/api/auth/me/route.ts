import { route, ok, fail } from "@/lib/http";
import { getSessionUser } from "@/lib/auth";
import { effectivePermissions } from "@/lib/permissions";

export const GET = route(async () => {
  const user = await getSessionUser();
  if (!user) return fail("Not signed in", 401);

  const { passwordHash: _omit, ...safe } = user;
  return ok({
    user: {
      ...safe,
      userType: user.userType,
      permissions: effectivePermissions(user),
    },
  });
});

export const dynamic = "force-dynamic";

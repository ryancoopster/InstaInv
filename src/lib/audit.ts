import "server-only";
import { prisma } from "@/lib/prisma";

export async function logActivity(params: {
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        meta: (params.meta ?? {}) as any,
      },
    });
  } catch (err) {
    // Never let audit logging break the request.
    console.error("[audit] failed", err);
  }
}

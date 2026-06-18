import "server-only";
import type { OrderRequestStatus } from "@prisma/client";

// F2: Explicit order-request state machine. The PATCH (per-request) and the bulk
// mark endpoint both consult this so a target status can only be reached from a
// legal predecessor — permission-by-target alone is not enough (e.g. it would
// otherwise let a REJECTED row jump straight to RECEIVED, fabricating stock and a
// Purchase row).
//
// Allowed predecessors per target status:
//   APPROVED / REJECTED -> only from REQUESTED
//   ORDERED             -> only from APPROVED
//   RECEIVED            -> from ORDERED or APPROVED (the ordered step may be skipped)
//
// REQUESTED is intentionally absent: there is no reverse-stock / void semantics for
// reopening a request, and no UI surface emits it (F5).
const ALLOWED_FROM: Record<OrderRequestStatus, readonly OrderRequestStatus[]> = {
  REQUESTED: [],
  APPROVED: ["REQUESTED"],
  REJECTED: ["REQUESTED"],
  ORDERED: ["APPROVED"],
  RECEIVED: ["ORDERED", "APPROVED"],
};

export function isAllowedTransition(
  from: OrderRequestStatus,
  to: OrderRequestStatus,
): boolean {
  return ALLOWED_FROM[to].includes(from);
}

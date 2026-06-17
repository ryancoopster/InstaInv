"use client";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { OrderRequestStatus, OrderRequestSource } from "@prisma/client";

const STATUS_META: Record<OrderRequestStatus, { label: string; variant: BadgeProps["variant"] }> = {
  REQUESTED: { label: "Requested", variant: "secondary" },
  APPROVED: { label: "Approved", variant: "default" },
  ORDERED: { label: "Ordered", variant: "warning" },
  RECEIVED: { label: "Received", variant: "success" },
  REJECTED: { label: "Rejected", variant: "destructive" },
};

const SOURCE_META: Record<OrderRequestSource, string> = {
  USER_REQUEST: "User request",
  STOCK_SHORTFALL: "Shortfall",
  ADMIN_MANUAL: "Manual",
};

export function StatusBadge({ status }: { status: OrderRequestStatus }) {
  const meta = STATUS_META[status];
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function SourceBadge({ source }: { source: OrderRequestSource }) {
  return <Badge variant="outline">{SOURCE_META[source]}</Badge>;
}

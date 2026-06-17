import type { Prisma } from "@prisma/client";

// Shared item include-shape + Decimal serializer.
// Lives in a non-route file so it can be imported by both route handlers and
// server components (Next.js forbids non-handler exports from route.ts).

// Include shape used everywhere we return an item with its relations.
export const itemInclude = {
  category: { select: { id: true, name: true, color: true } },
  supplier: { select: { id: true, name: true, website: true } },
  drawer: { select: { id: true, name: true, label: true, box: { select: { id: true, name: true } } } },
  bin: { select: { id: true, name: true } },
} satisfies Prisma.ItemInclude;

export type ItemWithRelations = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

// Decimal -> string so the JSON envelope is safe to parse with Number() in the UI.
export function serializeItem(item: ItemWithRelations) {
  return { ...item, purchaseCost: item.purchaseCost.toString() };
}

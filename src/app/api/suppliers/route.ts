import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { webUrlSchema } from "@/lib/url";
import { z } from "zod";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  name: z.string().min(1, "Name is required"),
  website: webUrlSchema.optional().nullable(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  accountNo: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
  // Live price fetching config (see src/lib/pricing/).
  priceFetchEnabled: z.boolean().optional(),
  priceParser: z.enum(["generic", "mouser", "mcmaster"]).optional().nullable(),
});

export const GET = route(async () => {
  await requirePermission("suppliers.view");
  const suppliers = await prisma.supplier.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { items: true } } },
  });
  return ok(suppliers);
});

export const POST = route(async (req: Request) => {
  const user = await requirePermission("suppliers.manage");
  const data = upsertSchema.parse(await req.json());

  const max = await prisma.supplier.aggregate({ _max: { sortOrder: true } });
  const supplier = await prisma.supplier.create({
    data: {
      name: data.name,
      website: data.website || null,
      email: data.email || null,
      phone: data.phone || null,
      accountNo: data.accountNo || null,
      notes: data.notes || null,
      priceFetchEnabled: data.priceFetchEnabled ?? false,
      priceParser: data.priceParser ?? null,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  });

  await logActivity({ userId: user.id, action: "supplier.create", entity: "Supplier", entityId: supplier.id });
  return ok(supplier);
});

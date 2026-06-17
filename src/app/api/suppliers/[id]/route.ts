import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  website: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  accountNo: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

type Params = { params: { id: string } };

export const GET = route(async (_req: Request, { params }: Params) => {
  await requirePermission("suppliers.view");
  const supplier = await prisma.supplier.findUnique({ where: { id: params.id } });
  return ok(supplier);
});

export const PATCH = route(async (req: Request, { params }: Params) => {
  const user = await requirePermission("suppliers.manage");
  const data = patchSchema.parse(await req.json());

  const supplier = await prisma.supplier.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.website !== undefined ? { website: data.website || null } : {}),
      ...(data.email !== undefined ? { email: data.email || null } : {}),
      ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      ...(data.accountNo !== undefined ? { accountNo: data.accountNo || null } : {}),
      ...(data.notes !== undefined ? { notes: data.notes || null } : {}),
    },
  });

  await logActivity({ userId: user.id, action: "supplier.update", entity: "Supplier", entityId: supplier.id });
  return ok(supplier);
});

export const DELETE = route(async (_req: Request, { params }: Params) => {
  const user = await requirePermission("suppliers.manage");
  await prisma.supplier.delete({ where: { id: params.id } });
  await logActivity({ userId: user.id, action: "supplier.delete", entity: "Supplier", entityId: params.id });
  return ok({ id: params.id });
});

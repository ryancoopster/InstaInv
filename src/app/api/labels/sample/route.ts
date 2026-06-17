import { route, ok } from "@/lib/http";
import { requirePermission } from "@/lib/auth";
import { z } from "zod";
import { listSampleEntities, loadEntityData } from "@/lib/labels/entity";
import { sampleEntity } from "@/lib/labels/bindings";
import type { LabelTargetKind } from "@/lib/labels/types";

const schema = z.object({
  target: z.enum(["ITEM", "BIN", "DRAWER", "BOX", "GENERIC"]),
  id: z.string().optional(),
});

// GET /api/labels/sample?target=ITEM           -> { options, data } (sample data)
// GET /api/labels/sample?target=ITEM&id=<id>   -> { options, data } (real entity)
// Powers the designer's live-preview "load a sample" selector.
export const GET = route(async (req: Request) => {
  await requirePermission("labels.view");
  const url = new URL(req.url);
  const q = schema.parse(Object.fromEntries(url.searchParams));
  const target = q.target as LabelTargetKind;

  const options = await listSampleEntities(target);
  let data = sampleEntity(target);
  if (q.id) {
    const loaded = await loadEntityData(target, q.id);
    if (loaded) data = loaded;
  }

  return ok({ options, data });
});

export const dynamic = "force-dynamic";

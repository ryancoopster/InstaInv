import "server-only";
import { prisma } from "@/lib/prisma";

// Auto-generate human-readable content summaries for drawers and boxes,
// e.g. "12 items across Hardware, Fasteners — 340 pieces on hand".
// Called after contents change. Heuristic/local (no external LLM needed),
// but written so it can be swapped for an LLM-backed summary later.

function summarizeItems(items: { name: string; quantity: number; category?: { name: string } | null }[]): string {
  if (items.length === 0) return "Empty.";
  const totalPieces = items.reduce((s, i) => s + (i.quantity || 0), 0);
  const cats = new Map<string, number>();
  for (const i of items) {
    const c = i.category?.name || "Uncategorized";
    cats.set(c, (cats.get(c) || 0) + 1);
  }
  const topCats = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([c]) => c);
  const sampleNames = items.slice(0, 3).map((i) => i.name);
  return (
    `${items.length} item${items.length === 1 ? "" : "s"} ` +
    `(${totalPieces} piece${totalPieces === 1 ? "" : "s"}) — ` +
    `${topCats.join(", ")}` +
    (sampleNames.length ? `. e.g. ${sampleNames.join(", ")}.` : ".")
  );
}

export async function refreshDrawerSummary(drawerId: string): Promise<string> {
  const items = await prisma.item.findMany({
    where: { drawerId },
    select: { name: true, quantity: true, category: { select: { name: true } } },
  });
  const summary = summarizeItems(items);
  await prisma.drawer.update({ where: { id: drawerId }, data: { summary } });
  return summary;
}

export async function refreshBoxSummary(boxId: string): Promise<string> {
  const items = await prisma.item.findMany({
    where: { drawer: { boxId } },
    select: { name: true, quantity: true, category: { select: { name: true } } },
  });
  const summary = summarizeItems(items);
  await prisma.box.update({ where: { id: boxId }, data: { summary } });
  return summary;
}

// Refresh both the drawer and its parent box (call after moving/editing an item).
export async function refreshLocationSummaries(drawerId?: string | null) {
  if (!drawerId) return;
  const drawer = await prisma.drawer.findUnique({ where: { id: drawerId }, select: { boxId: true } });
  await refreshDrawerSummary(drawerId);
  if (drawer?.boxId) await refreshBoxSummary(drawer.boxId);
}

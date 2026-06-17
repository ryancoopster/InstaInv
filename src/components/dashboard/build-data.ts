import "server-only";

// Server-only builder for the single, fully-serialized DashboardData payload the
// dashboard page hands to the client <DashboardGrid>. Every Decimal is converted
// to a number and every Date to an ISO string here so the object is safe to send
// across the client boundary. No widget fetches on its own.

import { prisma } from "@/lib/prisma";
import { reorderQty, formatCurrency, formatNumber } from "@/lib/utils";
import type {
  DashboardData,
  KpiDatum,
  LowStockRow,
  CategoryDatum,
  SupplierValueDatum,
  ActivityRow,
  PriceWatchRow,
} from "@/components/dashboard/data";

export async function buildDashboardData(): Promise<DashboardData> {
  // --- Parallel data load (kept to a handful of queries) ---
  const [
    items,
    boxCount,
    drawerCount,
    supplierCount,
    categoryCount,
    openRequests,
    activityLogs,
    priceItems,
    priceErrorCount,
  ] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        name: true,
        quantity: true,
        desiredQuantity: true,
        minQuantity: true,
        unit: true,
        purchaseCost: true,
        category: { select: { name: true } },
        supplier: { select: { name: true } },
        drawer: { select: { name: true, box: { select: { name: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.box.count(),
    prisma.drawer.count(),
    prisma.supplier.count(),
    prisma.category.count(),
    prisma.orderRequest.count({
      where: { status: { in: ["REQUESTED", "APPROVED", "ORDERED"] } },
    }),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        action: true,
        entity: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.item.findMany({
      where: { priceUpdatedAt: { not: null } },
      orderBy: { priceUpdatedAt: "desc" },
      take: 8,
      select: {
        id: true,
        name: true,
        lastFetchedPrice: true,
        priceUpdatedAt: true,
        priceFetchStatus: true,
        priceFetchError: true,
        priceSource: true,
        supplier: { select: { name: true } },
      },
    }),
    prisma.item.count({ where: { priceFetchStatus: "error" } }),
  ]);

  // --- Derived metrics over the item list ---
  let totalQuantity = 0;
  let totalValue = 0;
  for (const it of items) {
    const cost = Number(it.purchaseCost ?? 0);
    totalQuantity += it.quantity;
    totalValue += it.quantity * cost;
  }

  const isLow = (it: (typeof items)[number]) =>
    (it.minQuantity > 0 && it.quantity < it.minQuantity) ||
    (it.desiredQuantity > 0 && it.quantity < it.desiredQuantity);

  const lowStockItems = items.filter(isLow);
  const lowStockCount = lowStockItems.length;

  const lowStock: LowStockRow[] = lowStockItems
    .map((it) => {
      const target = Math.max(it.desiredQuantity, it.minQuantity);
      const location = [it.drawer?.box?.name, it.drawer?.name]
        .filter(Boolean)
        .join(" / ");
      return {
        id: it.id,
        name: it.name,
        category: it.category?.name ?? null,
        location: location || null,
        quantity: it.quantity,
        unit: it.unit ?? null,
        target,
        reorder: reorderQty(it.quantity, target),
        critical: it.minQuantity > 0 && it.quantity < it.minQuantity,
      };
    })
    .sort((a, b) => b.reorder - a.reorder)
    .slice(0, 8);

  // --- Category breakdown: count + summed on-hand value per category ---
  const categoryMap = new Map<string, { count: number; value: number }>();
  for (const it of items) {
    const name = it.category?.name ?? "Uncategorized";
    const entry = categoryMap.get(name) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += it.quantity * Number(it.purchaseCost ?? 0);
    categoryMap.set(name, entry);
  }
  const categories: CategoryDatum[] = Array.from(categoryMap, ([name, v]) => ({
    name,
    count: v.count,
    value: Math.round(v.value * 100) / 100,
  }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // --- Supplier value: summed on-hand value per supplier (top ~8) ---
  const supplierMap = new Map<string, number>();
  for (const it of items) {
    if (!it.supplier?.name) continue;
    const value = it.quantity * Number(it.purchaseCost ?? 0);
    if (value <= 0) continue;
    supplierMap.set(it.supplier.name, (supplierMap.get(it.supplier.name) ?? 0) + value);
  }
  const suppliers: SupplierValueDatum[] = Array.from(supplierMap, ([name, value]) => ({
    name,
    value: Math.round(value * 100) / 100,
  }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  // --- Recent activity (already limited to 8 in the query) ---
  const activity: ActivityRow[] = activityLogs.map((log) => ({
    id: log.id,
    action: log.action,
    entity: log.entity ?? null,
    userName: log.user?.name ?? null,
    createdAt: log.createdAt.toISOString(),
  }));

  // --- Price watch ---
  const priceWatch: PriceWatchRow[] = priceItems.map((it) => ({
    id: it.id,
    name: it.name,
    supplier: it.supplier?.name ?? null,
    lastFetchedPrice: it.lastFetchedPrice != null ? Number(it.lastFetchedPrice) : null,
    priceUpdatedAt: it.priceUpdatedAt ? it.priceUpdatedAt.toISOString() : null,
    priceFetchStatus: it.priceFetchStatus ?? null,
    priceFetchError: it.priceFetchError ?? null,
    priceSource: it.priceSource ?? null,
  }));

  // --- KPI stat cards ---
  const kpis: KpiDatum[] = [
    {
      key: "items",
      label: "Total items",
      value: formatNumber(items.length),
      sub: `${formatNumber(totalQuantity)} units on hand`,
      icon: "Package",
      href: "/items",
      accent: "text-primary bg-primary/10",
    },
    {
      key: "value",
      label: "Inventory value",
      value: formatCurrency(totalValue),
      sub: "current on-hand value",
      icon: "DollarSign",
      accent: "text-success bg-success/10",
    },
    {
      key: "lowStock",
      label: "Low stock",
      value: formatNumber(lowStockCount),
      sub: "below desired / min",
      icon: "AlertTriangle",
      href: "/reports",
      accent: "text-warning bg-warning/10",
    },
    {
      key: "openRequests",
      label: "Open requests",
      value: formatNumber(openRequests),
      sub: "in the order pipeline",
      icon: "ClipboardList",
      href: "/orders",
      accent: "text-primary bg-primary/10",
    },
    {
      key: "boxes",
      label: "Boxes",
      value: formatNumber(boxCount),
      sub: `${formatNumber(drawerCount)} drawers`,
      icon: "Boxes",
      href: "/boxes",
      accent: "text-foreground bg-muted",
    },
    {
      key: "suppliers",
      label: "Suppliers",
      value: formatNumber(supplierCount),
      sub: "vendors on file",
      icon: "Truck",
      href: "/suppliers",
      accent: "text-foreground bg-muted",
    },
    {
      key: "categories",
      label: "Categories",
      value: formatNumber(categoryCount),
      sub: "with custom fields",
      icon: "FolderTree",
      href: "/categories",
      accent: "text-foreground bg-muted",
    },
  ];

  return {
    kpis,
    lowStock,
    lowStockCount,
    categories,
    suppliers,
    activity,
    priceWatch,
    priceErrorCount,
    generatedAt: new Date().toISOString(),
  };
}

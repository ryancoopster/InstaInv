import Link from "next/link";
import {
  Package,
  Boxes,
  Truck,
  FolderTree,
  AlertTriangle,
  ClipboardList,
  DollarSign,
  ArrowRight,
  PackageCheck,
  ShoppingCart,
  ClipboardCheck,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { effectivePermissions, type PermissionKey } from "@/lib/permissions";
import { formatCurrency, formatNumber, reorderQty } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  CategoryBreakdownChart,
  SupplierValueChart,
  type CategoryDatum,
  type SupplierValueDatum,
} from "@/components/shell/dashboard-charts";

export const dynamic = "force-dynamic";

interface StatCard {
  label: string;
  value: string;
  icon: React.ElementType;
  href?: string;
  accent: string;
  sub?: string;
}

export default async function DashboardPage() {
  const user = await getSessionUser();
  const perms = user ? effectivePermissions(user) : ({} as Record<PermissionKey, boolean>);

  // --- Parallel data load ---
  const [
    items,
    boxCount,
    drawerCount,
    supplierCount,
    categoryCount,
    openRequests,
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
        category: { select: { name: true, color: true } },
        supplier: { select: { name: true } },
        drawer: { select: { name: true, box: { select: { name: true } } } },
        bin: { select: { name: true } },
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
  ]);

  // --- Derived metrics (computed in JS over items) ---
  const totalItems = items.length;
  let totalQuantity = 0;
  let totalValue = 0;

  for (const it of items) {
    const cost = Number(it.purchaseCost ?? 0);
    totalQuantity += it.quantity;
    totalValue += it.quantity * cost;
  }

  const lowStock = items
    .filter(
      (it) =>
        (it.minQuantity > 0 && it.quantity < it.minQuantity) ||
        (it.desiredQuantity > 0 && it.quantity < it.desiredQuantity),
    )
    .map((it) => ({
      ...it,
      reorder: reorderQty(it.quantity, Math.max(it.desiredQuantity, it.minQuantity)),
    }))
    .sort((a, b) => b.reorder - a.reorder)
    .slice(0, 8);

  const lowStockCount = items.filter(
    (it) =>
      (it.minQuantity > 0 && it.quantity < it.minQuantity) ||
      (it.desiredQuantity > 0 && it.quantity < it.desiredQuantity),
  ).length;

  // --- Chart data ---
  const categoryMap = new Map<string, number>();
  for (const it of items) {
    const name = it.category?.name ?? "Uncategorized";
    categoryMap.set(name, (categoryMap.get(name) ?? 0) + 1);
  }
  const categoryData: CategoryDatum[] = Array.from(categoryMap, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const supplierMap = new Map<string, number>();
  for (const it of items) {
    if (!it.supplier?.name) continue;
    const value = it.quantity * Number(it.purchaseCost ?? 0);
    if (value <= 0) continue;
    supplierMap.set(it.supplier.name, (supplierMap.get(it.supplier.name) ?? 0) + value);
  }
  const supplierData: SupplierValueDatum[] = Array.from(supplierMap, ([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const stats: StatCard[] = [
    {
      label: "Total items",
      value: formatNumber(totalItems),
      sub: `${formatNumber(totalQuantity)} units on hand`,
      icon: Package,
      href: "/items",
      accent: "text-primary bg-primary/10",
    },
    {
      label: "Inventory value",
      value: formatCurrency(totalValue),
      sub: "current on-hand value",
      icon: DollarSign,
      accent: "text-success bg-success/10",
    },
    {
      label: "Low stock",
      value: formatNumber(lowStockCount),
      sub: "below desired / min",
      icon: AlertTriangle,
      href: "/reports",
      accent: "text-warning bg-warning/10",
    },
    {
      label: "Open requests",
      value: formatNumber(openRequests),
      sub: "in the order pipeline",
      icon: ClipboardList,
      href: "/orders",
      accent: "text-primary bg-primary/10",
    },
    {
      label: "Boxes",
      value: formatNumber(boxCount),
      sub: `${formatNumber(drawerCount)} drawers`,
      icon: Boxes,
      href: "/boxes",
      accent: "text-foreground bg-muted",
    },
    {
      label: "Suppliers",
      value: formatNumber(supplierCount),
      sub: "vendors on file",
      icon: Truck,
      href: "/suppliers",
      accent: "text-foreground bg-muted",
    },
    {
      label: "Categories",
      value: formatNumber(categoryCount),
      sub: "with custom fields",
      icon: FolderTree,
      href: "/categories",
      accent: "text-foreground bg-muted",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}`}
        description="A snapshot of your inventory, stock levels and ordering pipeline."
        actions={
          <>
            {perms["items.adjustQuantity"] && (
              <Button asChild variant="outline">
                <Link href="/scan">
                  <ClipboardCheck className="h-4 w-4" />
                  Take inventory
                </Link>
              </Button>
            )}
            {perms["orders.viewAll"] && (
              <Button asChild>
                <Link href="/orders">
                  <ShoppingCart className="h-4 w-4" />
                  View buy list
                </Link>
              </Button>
            )}
          </>
        }
      />

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          const body = (
            <Card className="h-full transition-colors hover:border-primary/40">
              <CardContent className="flex items-start justify-between gap-3 p-5">
                <div className="min-w-0 space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="truncate text-2xl font-semibold tracking-tight">{s.value}</p>
                  {s.sub && <p className="truncate text-xs text-muted-foreground">{s.sub}</p>}
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.accent}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </CardContent>
            </Card>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-lg">
              {body}
            </Link>
          ) : (
            <div key={s.label}>{body}</div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryBreakdownChart data={categoryData} />
        <SupplierValueChart data={supplierData} />
      </div>

      {/* Low stock table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Low stock
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Items at or below their desired / minimum levels.
            </p>
          </div>
          {perms["reports.view"] && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/reports">
                Full report
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {lowStock.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="Everything's well stocked"
              description="No items are below their desired or minimum quantity."
              className="border-0 bg-transparent py-8"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">Current</TableHead>
                  <TableHead className="text-right">Desired</TableHead>
                  <TableHead className="text-right">Reorder</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lowStock.map((it) => {
                  const location = [it.drawer?.box?.name, it.drawer?.name, it.bin?.name]
                    .filter(Boolean)
                    .join(" › ");
                  const target = Math.max(it.desiredQuantity, it.minQuantity);
                  const critical = it.minQuantity > 0 && it.quantity < it.minQuantity;
                  return (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{it.name}</span>
                          {critical && <Badge variant="destructive">Critical</Badge>}
                        </div>
                        {it.category?.name && (
                          <span className="text-xs text-muted-foreground">{it.category.name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {location || <span className="italic">Unassigned</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(it.quantity)}
                        {it.unit ? ` ${it.unit}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatNumber(target)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={critical ? "destructive" : "warning"}>
                          +{formatNumber(it.reorder)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

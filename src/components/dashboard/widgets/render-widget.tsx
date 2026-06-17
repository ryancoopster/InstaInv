"use client";

import * as React from "react";
import type { PermissionKey } from "@/lib/permissions";
import type { DashboardData } from "@/components/dashboard/data";
import type { WidgetType } from "@/components/dashboard/types";
import { KpisWidget } from "@/components/dashboard/widgets/kpis-widget";
import { LowStockWidget } from "@/components/dashboard/widgets/low-stock-widget";
import { CategoryWidget } from "@/components/dashboard/widgets/category-widget";
import { SupplierWidget } from "@/components/dashboard/widgets/supplier-widget";
import { ActivityWidget } from "@/components/dashboard/widgets/activity-widget";
import { QuickActionsWidget } from "@/components/dashboard/widgets/quick-actions-widget";
import { PriceWatchWidget } from "@/components/dashboard/widgets/price-watch-widget";

// Pure dispatcher: widget type -> body. Kept separate from WidgetFrame so the
// frame stays generic and the data wiring lives in one place.
export function RenderWidget({
  type,
  data,
  editing,
  can,
}: {
  type: WidgetType;
  data: DashboardData;
  editing: boolean;
  can: (key: PermissionKey) => boolean;
}) {
  switch (type) {
    case "kpis":
      return <KpisWidget data={data.kpis} editing={editing} />;
    case "lowStock":
      return <LowStockWidget rows={data.lowStock} canViewReports={can("reports.view")} />;
    case "categoryBreakdown":
      return <CategoryWidget data={data.categories} />;
    case "supplierValue":
      return <SupplierWidget data={data.suppliers} canViewSuppliers={can("suppliers.view")} />;
    case "recentActivity":
      return <ActivityWidget rows={data.activity} />;
    case "quickActions":
      return <QuickActionsWidget can={can} editing={editing} />;
    case "priceWatch":
      return (
        <PriceWatchWidget
          rows={data.priceWatch}
          errorCount={data.priceErrorCount}
          canManageItems={can("items.edit") || can("pricing.manage")}
        />
      );
    default:
      return null;
  }
}

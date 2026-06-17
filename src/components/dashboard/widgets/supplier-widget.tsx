"use client";

import * as React from "react";
import { Truck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { WidgetHeader } from "@/components/dashboard/widgets/widget-header";
import { SupplierChart } from "@/components/dashboard/charts";
import type { SupplierValueDatum } from "@/components/dashboard/data";

export function SupplierWidget({
  data,
  canViewSuppliers,
}: {
  data: SupplierValueDatum[];
  canViewSuppliers: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <WidgetHeader
        icon={Truck}
        title="Value by supplier"
        description="On-hand stock value per supplier."
        link={canViewSuppliers ? { href: "/suppliers", label: "Suppliers" } : undefined}
      />
      <div className="p-5 pt-3">
        {data.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="No supplier value yet"
            description="Add purchase costs and suppliers to your items."
            className="border-0 bg-transparent py-8"
          />
        ) : (
          <SupplierChart data={data} />
        )}
      </div>
    </div>
  );
}

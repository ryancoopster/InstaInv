"use client";

import * as React from "react";
import { ShoppingCart, SlidersHorizontal } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { usePermissions } from "@/components/shell/permission-context";
import { BuyList } from "@/components/orders/buy-list";
import { StockLevelsEditor, type StockRow } from "@/components/orders/stock-levels-editor";
import type { ItemOption, SupplierOption } from "@/components/orders/request-form";
import type { BuyList as BuyListData } from "@/components/orders/buy-list-types";

// Tabbed orders view: the consolidated Buy List, and (for setDesired) a Set
// stock levels editor. Stays client-side so tab state and edits are local.
export function OrdersView({
  buyList,
  stockRows,
  items,
  suppliers,
}: {
  buyList: BuyListData;
  stockRows: StockRow[];
  items: ItemOption[];
  suppliers: SupplierOption[];
}) {
  const { can } = usePermissions();
  const canSetDesired = can("orders.setDesired");

  return (
    <Tabs defaultValue="buy-list" className="space-y-4">
      <TabsList>
        <TabsTrigger value="buy-list">
          <ShoppingCart className="h-4 w-4" />
          Buy list
        </TabsTrigger>
        {canSetDesired && (
          <TabsTrigger value="stock-levels">
            <SlidersHorizontal className="h-4 w-4" />
            Set stock levels
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="buy-list">
        <BuyList initial={buyList} items={items} suppliers={suppliers} />
      </TabsContent>

      {canSetDesired && (
        <TabsContent value="stock-levels">
          <StockLevelsEditor initial={stockRows} />
        </TabsContent>
      )}
    </Tabs>
  );
}

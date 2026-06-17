"use client";

import * as React from "react";
import { usePermissions } from "@/components/shell/permission-context";
import { RequestForm, type ItemOption, type SupplierOption } from "@/components/orders/request-form";
import { RequestList } from "@/components/orders/request-list";
import type { SerializedRequest } from "@/components/orders/serialize";

// Top-level client view for /requests. Owns the rows state so a freshly created
// request (from the form) prepends into the list immediately.
export function RequestsView({
  initial,
  items,
  suppliers,
}: {
  initial: SerializedRequest[];
  items: ItemOption[];
  suppliers: SupplierOption[];
}) {
  const { can } = usePermissions();
  const [rows, setRows] = React.useState<SerializedRequest[]>(initial);

  const canRequest = can("orders.request");

  return (
    <div className="space-y-4">
      {canRequest && (
        <div className="flex justify-end">
          <RequestForm
            items={items}
            suppliers={suppliers}
            onCreated={(created) => setRows((prev) => [created, ...prev])}
          />
        </div>
      )}
      <RequestList rows={rows} setRows={setRows} />
    </div>
  );
}

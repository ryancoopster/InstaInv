"use client";

import * as React from "react";
import Link from "next/link";
import {
  ShoppingCart,
  PackageCheck,
  Wand2,
  FileDown,
  RefreshCw,
  PackageSearch,
  Plus,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { usePermissions } from "@/components/shell/permission-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { ManualEntryForm } from "@/components/orders/manual-entry-form";
import type { ItemOption, SupplierOption } from "@/components/orders/request-form";
import type { BuyList as BuyListData, BuyListSource } from "@/components/orders/buy-list-types";

const SOURCE_LABEL: Record<BuyListSource, { label: string; variant: "outline" | "secondary" | "warning" }> = {
  STOCK_SHORTFALL: { label: "Shortfall", variant: "warning" },
  USER_REQUEST: { label: "Approved", variant: "secondary" },
  ADMIN_MANUAL: { label: "Manual", variant: "outline" },
};

export function BuyList({
  initial,
  items,
  suppliers,
}: {
  initial: BuyListData;
  items: ItemOption[];
  suppliers: SupplierOption[];
}) {
  const { can } = usePermissions();
  const [data, setData] = React.useState<BuyListData>(initial);
  const [loading, setLoading] = React.useState(false);
  const [markingGroup, setMarkingGroup] = React.useState<string | null>(null);

  const canGenerate = can("orders.setDesired") || can("orders.approve");
  const canMark = can("orders.markOrdered");
  const canExport = can("reports.export");
  const canManual = can("orders.approve");

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const fresh = await api.get<BuyListData>("/api/orders/buy-list");
      setData(fresh);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Could not refresh buy list");
    } finally {
      setLoading(false);
    }
  }, []);

  async function generateShortfalls() {
    setLoading(true);
    try {
      const res = await api.post<{ created: number }>("/api/orders/generate-shortfalls");
      toast.success(
        res.created > 0
          ? `Created ${res.created} shortfall request${res.created === 1 ? "" : "s"}`
          : "No new shortfalls to request",
      );
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Generate failed");
      setLoading(false);
    }
  }

  async function markGroupOrdered(requestIds: string[], groupKey: string) {
    if (requestIds.length === 0) {
      toast.info("Nothing to mark — this group has only live shortfalls. Generate requests first.");
      return;
    }
    setMarkingGroup(groupKey);
    try {
      const res = await api.patch<{ updated: number }>("/api/orders/mark", {
        ids: requestIds,
        status: "ORDERED",
      });
      toast.success(`Marked ${res.updated} line${res.updated === 1 ? "" : "s"} ordered`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Mark ordered failed");
    } finally {
      setMarkingGroup(null);
    }
  }

  const hasLines = data.groups.length > 0;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="warning">{data.shortfallCount} shortfalls</Badge>
          <Badge variant="secondary">{data.approvedCount} approved</Badge>
          <Badge variant="outline">{data.manualCount} manual</Badge>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            Refresh
          </Button>
          {canManual && (
            <ManualEntryForm
              items={items}
              suppliers={suppliers}
              onAdded={refresh}
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="h-4 w-4" />
                  Manual entry
                </Button>
              }
            />
          )}
          {canGenerate && (
            <Button variant="outline" size="sm" onClick={generateShortfalls} disabled={loading}>
              <Wand2 className="h-4 w-4" />
              Generate shortfall requests
            </Button>
          )}
          {canExport && (
            <Button asChild variant="outline" size="sm">
              <Link href="/reports">
                <FileDown className="h-4 w-4" />
                Export (PDF / Excel)
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!hasLines ? (
        <EmptyState
          icon={PackageSearch}
          title="Nothing to buy"
          description="No stock shortfalls, approved requests, or manual entries right now. Set desired stock levels or approve requests to populate the buy list."
        />
      ) : (
        <>
          {data.groups.map((group) => {
            const groupKey = group.supplierId ?? `name:${group.supplier}`;
            return (
              <Card key={groupKey}>
                <CardHeader className="flex-row items-center justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base">{group.supplier}</CardTitle>
                    <CardDescription>
                      {group.lines.length} line{group.lines.length === 1 ? "" : "s"} ·{" "}
                      <span className="font-medium text-foreground">
                        {formatCurrency(group.supplierTotal)}
                      </span>
                    </CardDescription>
                  </div>
                  {canMark && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={markingGroup === groupKey || group.approvedRequestIds.length === 0}
                      onClick={() => markGroupOrdered(group.approvedRequestIds, groupKey)}
                      title={
                        group.approvedRequestIds.length === 0
                          ? "Generate requests for shortfalls before ordering"
                          : "Mark every approved line in this group as ordered"
                      }
                    >
                      <ShoppingCart className="h-4 w-4" />
                      Mark group ordered
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Need</TableHead>
                          <TableHead className="text-right">Unit cost</TableHead>
                          <TableHead className="text-right">Line total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.lines.map((line) => {
                          const meta = SOURCE_LABEL[line.source];
                          return (
                            <TableRow key={line.key}>
                              <TableCell className="font-medium">
                                <div>{line.name}</div>
                                {line.partNumber && (
                                  <div className="text-xs text-muted-foreground">
                                    {line.partNumber}
                                  </div>
                                )}
                                {line.source === "STOCK_SHORTFALL" &&
                                  line.currentQuantity !== undefined && (
                                    <div className="text-xs text-muted-foreground">
                                      {line.currentQuantity} on hand / {line.desiredQuantity} desired
                                    </div>
                                  )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={meta.variant}>{meta.label}</Badge>
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {line.needed}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">
                                {formatCurrency(line.unitCost)}
                              </TableCell>
                              <TableCell className="text-right font-medium tabular-nums">
                                {formatCurrency(line.lineTotal)}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/40">
                          <TableCell colSpan={4} className="text-right font-medium">
                            Supplier total
                          </TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">
                            {formatCurrency(group.supplierTotal)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Grand total */}
          <Card>
            <CardContent className="flex items-center justify-between py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PackageCheck className="h-4 w-4" />
                Grand total across all suppliers
              </div>
              <div className="text-xl font-semibold tabular-nums">
                {formatCurrency(data.grandTotal)}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

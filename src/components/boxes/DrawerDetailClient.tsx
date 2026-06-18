"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  List as ListIcon,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { DrawerItemsList } from "./DrawerItemsList";
import { VirtualDrawer } from "./VirtualDrawer";
import { InventoryStepper } from "./InventoryStepper";
import type { BinDetail, DrawerDetail, DrawerItem, DrawerFieldDef } from "./types";

interface DrawerDetailClientProps {
  drawer: DrawerDetail;
  canManage: boolean;
  canReorganize: boolean;
  canAdjust: boolean;
  customFieldDefs?: DrawerFieldDef[];
  prevDrawerId: string | null;
  nextDrawerId: string | null;
}

export function DrawerDetailClient({
  drawer,
  canManage,
  canReorganize,
  canAdjust,
  customFieldDefs = [],
  prevDrawerId,
  nextDrawerId,
}: DrawerDetailClientProps) {
  const router = useRouter();
  const [bins, setBins] = React.useState<BinDetail[]>(drawer.bins);
  const [items, setItems] = React.useState<DrawerItem[]>(drawer.items);
  const [summary, setSummary] = React.useState<string | null>(drawer.summary);
  const [refreshing, setRefreshing] = React.useState(false);

  React.useEffect(() => {
    setBins(drawer.bins);
    setItems(drawer.items);
    setSummary(drawer.summary);
  }, [drawer.id, drawer.bins, drawer.items, drawer.summary]);

  function applyAdjust(itemId: string, quantity: number) {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)));
  }

  async function regenerateSummary() {
    setRefreshing(true);
    try {
      const res = await api.post<{ summary: string }>(`/api/drawers/${drawer.id}/summary`);
      setSummary(res.summary);
      toast.success("Summary regenerated");
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not refresh summary";
      toast.error({ title: "Summary failed", description: message });
    } finally {
      setRefreshing(false);
    }
  }

  function reloadDrawer() {
    // Soft refresh of server data so counts elsewhere stay accurate.
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2 text-muted-foreground">
          <Link href={`/boxes/${drawer.boxId}`}>
            <ArrowLeft className="h-4 w-4" />
            {drawer.box.name}
          </Link>
        </Button>

        <PageHeader
          title={
            <span className="flex items-center gap-2">
              {drawer.color && (
                <span
                  className="inline-block h-4 w-4 rounded-full border border-black/10"
                  style={{ backgroundColor: drawer.color }}
                />
              )}
              {drawer.name}
              {drawer.label && <Badge variant="outline">{drawer.label}</Badge>}
            </span>
          }
          description={
            <span className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {drawer.binRows} × {drawer.binCols} bins
              </Badge>
              <Badge variant="outline">
                {items.length} item{items.length === 1 ? "" : "s"}
              </Badge>
            </span>
          }
          actions={
            <div className="flex items-center rounded-md border border-border">
              <Button
                asChild={Boolean(prevDrawerId)}
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-r-none"
                disabled={!prevDrawerId}
                aria-label="Previous drawer"
              >
                {prevDrawerId ? (
                  <Link href={`/boxes/${drawer.boxId}/drawers/${prevDrawerId}`}>
                    <ChevronLeft className="h-4 w-4" />
                  </Link>
                ) : (
                  <span>
                    <ChevronLeft className="h-4 w-4" />
                  </span>
                )}
              </Button>
              <Button
                asChild={Boolean(nextDrawerId)}
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-l-none border-l border-border"
                disabled={!nextDrawerId}
                aria-label="Next drawer"
              >
                {nextDrawerId ? (
                  <Link href={`/boxes/${drawer.boxId}/drawers/${nextDrawerId}`}>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <span>
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
              </Button>
            </div>
          }
        />
      </div>

      {/* Auto summary */}
      <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">{summary || "No summary yet."}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={regenerateSummary}
          disabled={refreshing}
        >
          <RefreshCw className={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          Regenerate
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">
            <ListIcon className="h-4 w-4" />
            List
          </TabsTrigger>
          <TabsTrigger value="virtual">
            <Grid3x3 className="h-4 w-4" />
            Virtual drawer
          </TabsTrigger>
          <TabsTrigger value="stepper">
            <RefreshCw className="h-4 w-4" />
            Take inventory
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-4">
          <DrawerItemsList
            drawerId={drawer.id}
            items={items}
            bins={bins}
            canAdjust={canAdjust}
            canReorganize={canReorganize}
            onAdjusted={applyAdjust}
            onMovedOut={(itemId) => {
              setItems((prev) => prev.filter((i) => i.id !== itemId));
              reloadDrawer();
            }}
            onBinChanged={(itemId, binId) =>
              setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, binId } : i)))
            }
          />
        </TabsContent>

        <TabsContent value="virtual" className="mt-4">
          <VirtualDrawer
            drawerId={drawer.id}
            binRows={drawer.binRows}
            binCols={drawer.binCols}
            bins={bins}
            items={items}
            canManage={canManage}
            canReorganize={canReorganize}
            customFieldDefs={customFieldDefs}
            onChanged={reloadDrawer}
            setBins={setBins}
            setItems={setItems}
          />
        </TabsContent>

        <TabsContent value="stepper" className="mt-4">
          <InventoryStepper items={items} canAdjust={canAdjust} onAdjusted={applyAdjust} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

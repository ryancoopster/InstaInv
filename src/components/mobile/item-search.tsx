"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, Package, MapPin, X, ChevronRight } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";

// Defensive view of an item from GET /api/items?q= — the items module owns the
// exact shape, so we read location either nested or flat.
interface RawItem {
  id: string;
  name: string;
  partNumber?: string | null;
  sku?: string | null;
  unit?: string | null;
  quantity?: number;
  imageUrl?: string | null;
  drawerId?: string | null;
  drawer?: {
    id?: string;
    name?: string | null;
    box?: { id?: string; name?: string | null } | null;
  } | null;
  bin?: { id?: string; name?: string | null } | null;
  binName?: string | null;
  // Possible flat fallbacks.
  boxName?: string | null;
  drawerName?: string | null;
}

interface Located {
  id: string;
  name: string;
  partNumber: string | null;
  unit: string | null;
  quantity: number | null;
  imageUrl: string | null;
  boxName: string | null;
  drawerId: string | null;
  drawerName: string | null;
  binName: string | null;
}

function locate(raw: RawItem): Located {
  const drawerId = raw.drawer?.id ?? raw.drawerId ?? null;
  const drawerName = raw.drawer?.name ?? raw.drawerName ?? null;
  const boxName = raw.drawer?.box?.name ?? raw.boxName ?? null;
  const binName = raw.bin?.name ?? raw.binName ?? null;
  return {
    id: raw.id,
    name: raw.name,
    partNumber: raw.partNumber ?? null,
    unit: raw.unit ?? null,
    quantity: typeof raw.quantity === "number" ? raw.quantity : null,
    imageUrl: raw.imageUrl ?? null,
    boxName,
    drawerId,
    drawerName,
    binName,
  };
}

// Tolerate either an array, or a paginated `{ items: [...] }` / `{ rows: [...] }`.
function extractItems(data: unknown): RawItem[] {
  if (Array.isArray(data)) return data as RawItem[];
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["items", "rows", "results", "data"]) {
      if (Array.isArray(obj[key])) return obj[key] as RawItem[];
    }
  }
  return [];
}

export function ItemSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [query, setQuery] = React.useState(initialQuery);
  const [results, setResults] = React.useState<Located[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [searched, setSearched] = React.useState(false);

  const runSearch = React.useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setSearched(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.get<unknown>(
        `/api/items?q=${encodeURIComponent(trimmed)}`,
      );
      setResults(extractItems(data).map(locate));
      setSearched(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Search failed");
      setResults([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search as the user types.
  React.useEffect(() => {
    const handle = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(handle);
  }, [query, runSearch]);

  const go = (item: Located) => {
    if (!item.drawerId) return;
    router.push(`/m/drawers/${item.drawerId}?item=${item.id}`);
  };

  return (
    <div className="space-y-4">
      <header className="px-1">
        <h1 className="text-xl font-bold tracking-tight">Search items</h1>
        <p className="text-sm text-muted-foreground">
          Find an item and jump to where it lives.
        </p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, part number, SKU…"
          inputMode="search"
          autoFocus
          className="h-12 pl-10 pr-10 text-base"
          aria-label="Search items"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Spinner label="Searching…" />
        </div>
      )}

      {!loading && error && (
        <EmptyState icon={Search} title="Couldn't search" description={error} />
      )}

      {!loading && !error && searched && results.length === 0 && (
        <EmptyState
          icon={Search}
          title="No matches"
          description={`Nothing found for “${query.trim()}”.`}
        />
      )}

      {!loading && !error && !searched && (
        <EmptyState
          icon={Search}
          title="Start typing"
          description="Search by item name, part number or SKU."
        />
      )}

      {!loading && results.length > 0 && (
        <ul className="space-y-2.5">
          {results.map((item) => {
            const hasLocation = !!item.drawerId;
            return (
              <li
                key={item.id}
                className="rounded-xl border border-border bg-card p-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-border bg-muted">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Package className="h-5 w-5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight text-foreground">
                      {item.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.partNumber ? `PN ${item.partNumber}` : "No part number"}
                      {item.quantity != null && (
                        <> · {item.quantity} on hand</>
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 shrink-0" />
                    {hasLocation ? (
                      <span className="truncate">
                        {[item.boxName, item.drawerName, item.binName]
                          .filter(Boolean)
                          .join(" › ") || "Located"}
                      </span>
                    ) : (
                      <Badge variant="outline">Unassigned</Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={hasLocation ? "default" : "outline"}
                    disabled={!hasLocation}
                    onClick={() => go(item)}
                  >
                    Count <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

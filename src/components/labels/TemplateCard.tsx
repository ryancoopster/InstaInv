"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, MoreVertical, Pencil, Copy, Trash2, Star, Printer } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { renderLabelSvg } from "@/lib/labels/svg";
import { sampleEntity } from "@/lib/labels/bindings";
import { normalizeContent } from "@/lib/labels/types";
import type { LabelTemplateDTO } from "./types";

function Thumbnail({ tpl }: { tpl: LabelTemplateDTO }) {
  const svg = React.useMemo(() => {
    const content = normalizeContent(tpl.content);
    // Render with a moderate dpi for a light thumbnail.
    return renderLabelSvg({ ...content, dpi: 150 }, tpl.widthMm, tpl.heightMm, sampleEntity(tpl.target));
  }, [tpl]);

  const aspect = tpl.widthMm / Math.max(tpl.heightMm, 1);

  return (
    <div className="flex items-center justify-center rounded-md border border-border bg-white p-2">
      <div
        className="w-full"
        style={{ aspectRatio: String(aspect) }}
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: svg.replace("<svg ", '<svg preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;display:block" '),
        }}
      />
    </div>
  );
}

export function TemplateCard({
  tpl,
  canDesign,
  canPrint,
  onDuplicate,
  onDelete,
  onSetDefault,
  onPrint,
}: {
  tpl: LabelTemplateDTO;
  canDesign: boolean;
  canPrint: boolean;
  onDuplicate: (tpl: LabelTemplateDTO) => void;
  onDelete: (tpl: LabelTemplateDTO) => void;
  onSetDefault: (tpl: LabelTemplateDTO) => void;
  onPrint: (tpl: LabelTemplateDTO) => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tpl.id,
    disabled: !canDesign,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="flex flex-col gap-3 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {canDesign && (
            <button
              type="button"
              className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
              aria-label="Drag to reorder"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{tpl.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {tpl.tapeName || `${tpl.widthMm}×${tpl.heightMm} mm`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {tpl.isDefault && (
            <Badge variant="success" className="gap-1">
              <Star className="h-3 w-3" /> Default
            </Badge>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Template actions">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {canDesign && (
                <DropdownMenuItem onClick={() => router.push(`/labels/${tpl.id}`)}>
                  <Pencil className="h-4 w-4" /> Edit
                </DropdownMenuItem>
              )}
              {canPrint && (
                <DropdownMenuItem onClick={() => onPrint(tpl)}>
                  <Printer className="h-4 w-4" /> Print preview
                </DropdownMenuItem>
              )}
              {canDesign && (
                <>
                  <DropdownMenuItem onClick={() => onDuplicate(tpl)}>
                    <Copy className="h-4 w-4" /> Duplicate
                  </DropdownMenuItem>
                  {!tpl.isDefault && (
                    <DropdownMenuItem onClick={() => onSetDefault(tpl)}>
                      <Star className="h-4 w-4" /> Set as default
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onClick={() => onDelete(tpl)}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {canDesign ? (
        <Link href={`/labels/${tpl.id}`} className="block">
          <Thumbnail tpl={tpl} />
        </Link>
      ) : (
        <Thumbnail tpl={tpl} />
      )}
    </Card>
  );
}

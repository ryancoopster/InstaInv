"use client";

import * as React from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import type { BoxListItem } from "./types";

interface BoxFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the form edits this box; otherwise it creates a new one. */
  box?: BoxListItem | null;
  onSaved: () => void;
}

interface UploadResult {
  url: string;
}

export function BoxForm({ open, onOpenChange, box, onSaved }: BoxFormProps) {
  const editing = Boolean(box);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [gridRows, setGridRows] = React.useState(4);
  const [gridCols, setGridCols] = React.useState(1);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(box?.name ?? "");
    setDescription(box?.description ?? "");
    setLocation(box?.location ?? "");
    setImageUrl(box?.imageUrl ?? null);
    setGridRows(box?.gridRows ?? 4);
    setGridCols(box?.gridCols ?? 1);
  }, [open, box]);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      // The items module owns POST /api/uploads (shared endpoint).
      const res = await api.post<UploadResult>("/api/uploads", form);
      setImageUrl(res.url);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Upload failed";
      toast.error({ title: "Image upload failed", description: message });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Box name is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        imageUrl: imageUrl || null,
        gridRows,
        gridCols,
      };
      if (editing && box) {
        await api.patch(`/api/boxes/${box.id}`, payload);
        toast.success("Box updated");
      } else {
        await api.post("/api/boxes", payload);
        toast.success("Box created");
      }
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Could not save box";
      toast.error({ title: "Save failed", description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit box" : "New box"}</DialogTitle>
          <DialogDescription>
            A box (or case) holds drawers. The front-view grid defines how drawers lay out.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="box-name">Name</Label>
            <Input
              id="box-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fastener case A"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="box-location">Location</Label>
            <Input
              id="box-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Shelf 3, Bay 2"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="box-desc">Description</Label>
            <Textarea
              id="box-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional notes about this box"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="box-rows">Front-view rows</Label>
              <Input
                id="box-rows"
                type="number"
                min={1}
                max={20}
                value={gridRows}
                onChange={(e) => setGridRows(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="box-cols">Front-view columns</Label>
              <Input
                id="box-cols"
                type="number"
                min={1}
                max={20}
                value={gridCols}
                onChange={(e) => setGridCols(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Image</Label>
            <div className="flex items-center gap-3">
              <div className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Box" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-muted-foreground" />
                )}
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl(null)}
                    className="absolute right-0.5 top-0.5 rounded-full bg-background/80 p-0.5 text-foreground shadow hover:bg-background"
                    aria-label="Remove image"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  {imageUrl ? "Replace" : "Upload"}
                </Button>
                <p className="text-xs text-muted-foreground">PNG or JPG.</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "Save changes" : "Create box"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

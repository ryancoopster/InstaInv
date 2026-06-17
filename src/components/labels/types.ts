// Client-side DTOs for the labels UI. A LabelTemplate as it arrives over JSON
// (Float fields are plain numbers; content is the LabelContent JSON).

import type { LabelContent, LabelTargetKind } from "@/lib/labels/types";

export interface LabelTemplateDTO {
  id: string;
  name: string;
  target: LabelTargetKind;
  widthMm: number;
  heightMm: number;
  tapeName: string | null;
  orientation: string;
  content: LabelContent | Record<string, unknown>;
  isDefault: boolean;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

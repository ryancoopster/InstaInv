"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChecklistGenerator } from "./ChecklistGenerator";
import { ScanUploader } from "./ScanUploader";
import { OcrReviewTable } from "./OcrReviewTable";
import type { ApplyResult, BoxOption, OcrResult, ParsedRow } from "./types";

// Top-level client coordinator for the /scan page. Owns the active tab and the
// transient OCR/parse state that flows from the uploader into the review table.
export function ScanWorkspace({ boxes }: { boxes: BoxOption[] }) {
  const router = useRouter();
  const [tab, setTab] = React.useState("generate");
  const [review, setReview] = React.useState<{
    box: BoxOption;
    rows: ParsedRow[];
    ocr: OcrResult;
  } | null>(null);

  function handleParsed(box: BoxOption, rows: ParsedRow[], ocr: OcrResult) {
    setReview({ box, rows, ocr });
  }

  function handleApplied(_result: ApplyResult) {
    setReview(null);
    // Re-fetch server data so box item counts / summaries reflect the new state.
    router.refresh();
  }

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList>
        <TabsTrigger value="generate">Generate checklist</TabsTrigger>
        <TabsTrigger value="scan">Scan &amp; apply</TabsTrigger>
      </TabsList>

      <TabsContent value="generate" className="mt-4">
        <ChecklistGenerator boxes={boxes} />
      </TabsContent>

      <TabsContent value="scan" className="mt-4 space-y-6">
        {!review && <ScanUploader boxes={boxes} onParsed={handleParsed} />}
        {review && (
          <OcrReviewTable
            box={review.box}
            rows={review.rows}
            onApplied={handleApplied}
            onReset={() => setReview(null)}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

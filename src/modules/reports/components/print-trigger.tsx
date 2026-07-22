"use client";

import { Button } from "@/components/ui/button";

/**
 * Print controls. Hidden from the printed output itself via `print:hidden`, so
 * the PDF contains only the report.
 */
export function PrintTrigger() {
  return (
    <div className="mb-4 flex items-center gap-2 print:hidden">
      <Button size="sm" onClick={() => window.print()}>
        Print / Save as PDF
      </Button>
      <Button size="sm" variant="outline" onClick={() => window.history.back()}>
        Back
      </Button>
      <span className="text-xs text-muted-foreground">
        Choose “Save as PDF” in the print dialog to keep a copy.
      </span>
    </div>
  );
}

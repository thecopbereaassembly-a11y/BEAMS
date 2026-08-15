"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, buttonVariants } from "@/components/ui/button";
import { Alert, Card, Badge } from "@/components/ui/primitives";
import {
  previewImportAction,
  commitImportAction,
  type ImportState,
} from "../actions/import.actions";

function SubmitButton({ idle, busy, ...rest }: { idle: string; busy: string } & React.ComponentProps<typeof Button>) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} {...rest}>
      {pending ? busy : idle}
    </Button>
  );
}

export function ImportMembersForm() {
  const [preview, previewAction] = useActionState<ImportState, FormData>(previewImportAction, {});
  const [commit, commitAction] = useActionState<ImportState, FormData>(commitImportAction, {});

  // Once imported, show the outcome and nothing else.
  if (commit.result) {
    const { inserted, skipped, skippedDetail } = commit.result;
    return (
      <Card className="border-success/40 bg-success/5 p-5">
        <h2 className="text-base font-semibold text-success">Import complete</h2>
        <p className="mt-1 text-sm">
          <strong>{inserted}</strong> {inserted === 1 ? "member" : "members"} added
          {skipped > 0 && <> · <strong>{skipped}</strong> skipped as duplicates</>}.
        </p>
        {skippedDetail.length > 0 && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">Skipped rows</p>
            <ul className="mt-1 space-y-0.5 text-sm">
              {skippedDetail.map((s, i) => (
                <li key={i}>
                  {s.name} — <span className="text-muted-foreground">{s.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <Link href="/members" className={buttonVariants({ size: "sm" })}>
            View members
          </Link>
          <Link href="/members/import" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Import another file
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Step 1 — choose & preview the file */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">1. Choose your Excel file</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          A <code>.xlsx</code> file with a header row. Not sure of the format?{" "}
          <a href="/api/members/import-template" className="text-primary underline">
            Download the template
          </a>{" "}
          and paste your data into it.
        </p>

        <form action={previewAction} className="mt-4 space-y-3">
          {preview.error && <Alert>{preview.error}</Alert>}
          <input
            type="file"
            name="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
          />
          <SubmitButton idle="Preview import" busy="Reading…" variant="outline" />
        </form>
      </Card>

      {/* Step 2 — review what was found, then commit */}
      {preview.summary && (
        <Card className="p-5">
          <h2 className="text-sm font-semibold">2. Review</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone="success">{preview.summary.validCount} ready to import</Badge>
            {preview.summary.errorCount > 0 && (
              <Badge tone="warning">{preview.summary.errorCount} rows with problems</Badge>
            )}
            <Badge>{preview.summary.totalRows} rows read</Badge>
          </div>

          {preview.summary.unmappedHeaders.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Ignored unrecognized columns: {preview.summary.unmappedHeaders.join(", ")}.
            </p>
          )}
          {preview.summary.truncated && (
            <div className="mt-3">
              <Alert tone="warning">
                Only the first 5,000 rows were read. Split larger files and import them in parts.
              </Alert>
            </div>
          )}

          {preview.errors && preview.errors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground">
                These rows will be skipped — fix them in the sheet and re-import if needed:
              </p>
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/80">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Problem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.errors.map((e) => (
                      <tr key={e.row} className="border-t">
                        <td className="px-3 py-1.5 text-muted-foreground">{e.row}</td>
                        <td className="px-3 py-1.5">{e.name}</td>
                        <td className="px-3 py-1.5">{e.messages.join("; ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {commit.error && <div className="mt-4"><Alert>{commit.error}</Alert></div>}

          {preview.summary.validCount > 0 ? (
            <form action={commitAction} className="mt-4">
              <input type="hidden" name="validJson" value={preview.validJson ?? "[]"} />
              <SubmitButton
                idle={`Import ${preview.summary.validCount} ${preview.summary.validCount === 1 ? "member" : "members"}`}
                busy="Importing…"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                Duplicates (matching Member No, phone, or email already on file) are skipped
                automatically, so re-running is safe.
              </p>
            </form>
          ) : (
            <div className="mt-4">
              <Alert tone="warning">No valid rows to import. Fix the problems above and try again.</Alert>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { ForbiddenError } from "@/shared/rbac/can";
import { memberImportRowSchema } from "../schemas/member-import.schema";
import { parseMemberWorkbook, type RowError } from "../services/import.service";
import { importMembers, type ImportOutcome } from "../services/membership.service";

/** Upfront cap so a huge upload can't exhaust memory before we even parse it. */
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
/** Only show the first N row errors in the UI; the count still reflects all. */
const MAX_SHOWN_ERRORS = 100;

export interface ImportState {
  error?: string;
  phase?: "preview" | "done";
  summary?: {
    totalRows: number;
    validCount: number;
    errorCount: number;
    mappedFields: string[];
    unmappedHeaders: string[];
    truncated: boolean;
  };
  errors?: RowError[];
  /** Validated rows serialized for the commit step (avoids re-uploading). */
  validJson?: string;
  result?: ImportOutcome;
}

export async function previewImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an Excel (.xlsx) file to import." };
  }
  if (file.size > MAX_FILE_BYTES) {
    return { error: "That file is larger than 8 MB. Split it into smaller files." };
  }

  let parsed;
  try {
    const buffer = await file.arrayBuffer();
    parsed = await parseMemberWorkbook(buffer);
  } catch {
    return { error: "Could not read that file. Make sure it's a real .xlsx spreadsheet (not .xls or a PDF)." };
  }

  if (!parsed.mappedFields.includes("first_name") || !parsed.mappedFields.includes("last_name")) {
    return {
      error:
        "Couldn't find the required columns. The sheet needs at least 'First Name' and 'Last Name' headers in the first row. Download the template to see the expected columns.",
    };
  }

  if (parsed.totalRows === 0) {
    return { error: "No member rows found beneath the header row." };
  }

  return {
    phase: "preview",
    summary: {
      totalRows: parsed.totalRows,
      validCount: parsed.valid.length,
      errorCount: parsed.errors.length,
      mappedFields: parsed.mappedFields,
      unmappedHeaders: parsed.unmappedHeaders,
      truncated: parsed.truncated,
    },
    errors: parsed.errors.slice(0, MAX_SHOWN_ERRORS),
    validJson: JSON.stringify(parsed.valid),
  };
}

export async function commitImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const ctx = await getAuthContext();
  if (!ctx) return { error: "Your session has expired. Please sign in again." };

  const validJson = formData.get("validJson");
  if (typeof validJson !== "string" || !validJson) {
    return { error: "Nothing to import — please choose a file and preview it first." };
  }

  // Re-validate every row server-side; never trust the round-tripped payload.
  let rows;
  try {
    const arr = JSON.parse(validJson);
    if (!Array.isArray(arr)) throw new Error("bad payload");
    rows = arr.map((r) => memberImportRowSchema.parse(r));
  } catch {
    return { error: "The import data was invalid. Please preview the file again." };
  }

  if (rows.length === 0) return { error: "There are no valid rows to import." };

  try {
    const result = await importMembers(ctx, rows);
    if (!result.ok) return { error: result.error.message };
    revalidatePath("/members");
    return { phase: "done", result: result.data };
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { error: "You do not have permission to add members." };
    }
    return { error: error instanceof Error ? error.message : "Import failed." };
  }
}

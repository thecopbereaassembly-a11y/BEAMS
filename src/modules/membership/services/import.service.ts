import "server-only";
import ExcelJS from "exceljs";
import {
  memberImportRowSchema,
  type MemberImportRow,
  fieldForHeader,
  normalizeBoolean,
  normalizeGender,
  normalizeMarital,
  normalizeStatus,
  TEMPLATE_COLUMNS,
} from "../schemas/member-import.schema";

/**
 * Bulk member import from Excel/CSV-style spreadsheets. Parsing and validation
 * happen here (framework-agnostic, unit-testable); the service layer performs
 * the actual inserts. Nothing is written during a parse — callers preview first,
 * then commit only the rows that validated.
 */

/** Refuse absurd files so a bad upload can't tie up the server. */
export const MAX_IMPORT_ROWS = 5000;

export interface RowError {
  /** 1-based row number in the sheet (matches what the user sees in Excel). */
  row: number;
  name: string;
  messages: string[];
}

export interface ParseResult {
  valid: MemberImportRow[];
  errors: RowError[];
  totalRows: number;
  mappedFields: string[];
  unmappedHeaders: string[];
  truncated: boolean;
}

const FALLBACK_MSG = "Invalid value";

/** Read any ExcelJS cell value as clean text (handles rich text, links, formulas). */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return toDateString(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value.trim();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if ("text" in v && typeof v.text === "string") return v.text.trim(); // hyperlink
    if ("result" in v) return v.result == null ? "" : String(v.result).trim(); // formula
    if ("richText" in v && Array.isArray(v.richText)) {
      return v.richText.map((r: { text?: string }) => r.text ?? "").join("").trim();
    }
  }
  return String(value).trim();
}

function toDateString(d: Date): string {
  // Use UTC parts — ExcelJS returns dates anchored to UTC midnight.
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalize a date-ish cell to YYYY-MM-DD. Handles Date objects, Excel serial
 * numbers, ISO strings, and (Ghana-common) day-first D/M/YYYY strings.
 */
function cellToDateString(value: ExcelJS.CellValue): string {
  if (value instanceof Date) return toDateString(value);
  if (typeof value === "number" && value > 0) {
    // Excel serial date → JS date (epoch 1899-12-30, UTC to avoid tz drift).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    return toDateString(new Date(ms));
  }
  const s = cellText(value);
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) {
    // Day-first is the Ghanaian convention.
    const day = (dmy[1] ?? "").padStart(2, "0");
    const month = (dmy[2] ?? "").padStart(2, "0");
    const y = dmy[3] ?? "";
    return `${y}-${month}-${day}`;
  }
  return s; // let the schema reject anything still unparseable
}

/** Parse an uploaded workbook buffer into validated rows + per-row errors. */
export async function parseMemberWorkbook(buffer: ArrayBuffer | Buffer): Promise<ParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as ArrayBuffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { valid: [], errors: [], totalRows: 0, mappedFields: [], unmappedHeaders: [], truncated: false };
  }

  // ── Header row → column-index map ──────────────────────────────────────────
  const headerRow = sheet.getRow(1);
  const colToField = new Map<number, string>();
  const unmappedHeaders: string[] = [];
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const label = cellText(cell.value);
    if (!label) return;
    const field = fieldForHeader(label);
    if (field) colToField.set(colNumber, field);
    else unmappedHeaders.push(label);
  });

  const mappedFields = [...new Set(colToField.values())];
  const valid: MemberImportRow[] = [];
  const errors: RowError[] = [];
  let totalRows = 0;
  let truncated = false;

  const lastRow = sheet.rowCount;
  for (let r = 2; r <= lastRow; r++) {
    if (totalRows >= MAX_IMPORT_ROWS) {
      truncated = true;
      break;
    }
    const row = sheet.getRow(r);

    // Build the raw record from mapped columns.
    const raw: Record<string, unknown> = {};
    let hasAnyValue = false;
    for (const [col, field] of colToField) {
      const cell = row.getCell(col);
      let text: string;
      if (field === "date_of_birth" || field === "wedding_anniversary" || field === "joined_on") {
        text = cellToDateString(cell.value);
      } else {
        text = cellText(cell.value);
      }
      if (text !== "") hasAnyValue = true;
      raw[field] = text;
    }
    if (!hasAnyValue) continue; // skip fully blank rows
    totalRows++;

    // Apply loose-value normalization before schema validation.
    if (typeof raw.gender === "string") raw.gender = normalizeGender(raw.gender) || undefined;
    if (typeof raw.marital_status === "string") raw.marital_status = normalizeMarital(raw.marital_status) || undefined;
    raw.current_status = normalizeStatus(typeof raw.current_status === "string" ? raw.current_status : "");
    raw.is_water_baptized = normalizeBoolean(typeof raw.is_water_baptized === "string" ? raw.is_water_baptized : "");
    raw.is_holy_spirit_baptized = normalizeBoolean(typeof raw.is_holy_spirit_baptized === "string" ? raw.is_holy_spirit_baptized : "");
    if (typeof raw.primary_phone === "string") raw.primary_phone = raw.primary_phone.replace(/\s+/g, " ").trim();

    const parsed = memberImportRowSchema.safeParse(raw);
    if (parsed.success) {
      valid.push(parsed.data);
    } else {
      const flat = parsed.error.flatten().fieldErrors;
      const messages = Object.entries(flat).map(
        ([field, msgs]) => `${field}: ${(msgs ?? [FALLBACK_MSG])[0]}`,
      );
      errors.push({
        row: r,
        name: [raw.first_name, raw.last_name].filter(Boolean).join(" ") || `Row ${r}`,
        messages: messages.length ? messages : [FALLBACK_MSG],
      });
    }
  }

  return { valid, errors, totalRows, mappedFields, unmappedHeaders, truncated };
}

/** Build the downloadable import template with headers, an example, and notes. */
export async function buildImportTemplate(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BEAMS";

  const sheet = workbook.addWorksheet("Members");
  sheet.columns = TEMPLATE_COLUMNS.map((c) => ({
    header: c.header,
    key: c.field,
    width: Math.max(14, Math.min(32, c.header.length + 8)),
  }));
  sheet.addRow(Object.fromEntries(TEMPLATE_COLUMNS.map((c) => [c.field, c.example])));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1740B3" } };
  header.alignment = { vertical: "middle" };
  header.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const notes = workbook.addWorksheet("Instructions");
  notes.columns = [{ width: 24 }, { width: 70 }];
  const line = (a: string, b: string, bold = false) => {
    const row = notes.addRow([a, b]);
    if (bold) row.font = { bold: true };
  };
  line("How to use", "Keep the header row exactly as it is. Add one member per row. Delete the example row before importing.", true);
  line("", "");
  line("First Name, Last Name", "Required. Everything else is optional.");
  line("Gender", "Male or Female (M / F also accepted).");
  line("Marital Status", "Single, Married, Divorced, Widowed, or Separated.");
  line("Status", "Member, Visitor, New convert, Inactive, Transferred out, or Deceased. Defaults to Member.");
  line("Dates", "Use YYYY-MM-DD (e.g. 1990-04-12). Day/Month/Year like 12/04/1990 also works.");
  line("Phone", "Ghana number, e.g. 024 412 3456 or 0244123456.");
  line("GPS Address", "Ghana Post GPS, e.g. GA-123-4567.");
  line("Water Baptized / Holy Spirit Baptized", "Yes or No.");
  line("Member No", "Optional. Your existing membership ID, if you have one.");

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

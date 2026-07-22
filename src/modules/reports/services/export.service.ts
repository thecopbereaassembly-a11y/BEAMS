import "server-only";
import ExcelJS from "exceljs";
import type { ReportResult } from "./report.service";

/**
 * Report export formats (docs/04 §19). CSV and Excel are generated here; PDF is
 * produced from the print view (see /reports/[key]/print) so the layout matches
 * exactly what the user saw, without shipping a headless-browser pipeline.
 */

/** RFC 4180 quoting: wrap in quotes and double any embedded quote. */
function csvCell(value: string | number | null): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(report: ReportResult): string {
  const { definition, rows } = report;
  const header = definition.columns.map((c) => csvCell(c.label)).join(",");
  const body = rows
    .map((row) => definition.columns.map((c) => csvCell(row[c.key] ?? "")).join(","))
    .join("\r\n");

  // BOM so Excel opens UTF-8 (accented Ghanaian names) correctly.
  return `﻿${header}\r\n${body}`;
}

export async function toXlsx(report: ReportResult): Promise<Buffer> {
  const { definition, rows } = report;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BEAMS";
  workbook.created = new Date(report.generatedAt);

  const sheet = workbook.addWorksheet(definition.name.slice(0, 31));

  sheet.columns = definition.columns.map((c) => ({
    header: c.label,
    key: c.key,
    width: Math.max(12, Math.min(40, c.label.length + 6)),
  }));

  rows.forEach((row) => {
    sheet.addRow(
      Object.fromEntries(definition.columns.map((c) => [c.key, row[c.key] ?? ""])),
    );
  });

  // Header styling + freeze so long registers stay readable.
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1740B3" }, // CoP deep blue
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  definition.columns.forEach((c, i) => {
    if (c.numeric) {
      sheet.getColumn(i + 1).alignment = { horizontal: "right" };
    }
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: definition.columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

/** Safe, dated filename: "member-register-2026-07-22.csv" */
export function exportFilename(report: ReportResult, extension: string): string {
  const slug = report.definition.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug}-${report.generatedAt.slice(0, 10)}.${extension}`;
}

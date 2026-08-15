import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { ReportResult } from "./report.service";

/** Load the crest once and reuse it across exports. */
let logoBufferPromise: Promise<Buffer | null> | null = null;
function loadLogo(): Promise<Buffer | null> {
  logoBufferPromise ??= readFile(path.join(process.cwd(), "public", "logo.png"))
    .catch(() => null);
  return logoBufferPromise;
}

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

const NAVY = "FF231A6D"; // CoP Berea navy

export async function toXlsx(report: ReportResult): Promise<Buffer> {
  const { definition, rows } = report;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "BEAMS";
  workbook.created = new Date(report.generatedAt);

  const sheet = workbook.addWorksheet(definition.name.slice(0, 31));
  const colCount = definition.columns.length;

  // ── Branded title band (crest + heading), header table below it ────────────
  const logo = await loadLogo();
  const headerRowNo = logo ? 4 : 1;

  if (logo) {
    // exceljs types its buffer against an older Buffer generic than @types/node
    // 22 emits; the runtime value is correct, only the types differ.
    const imageId = workbook.addImage(
      { buffer: logo, extension: "png" } as unknown as Parameters<typeof workbook.addImage>[0],
    );
    sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 52, height: 52 } });

    const title = sheet.getCell(1, 2);
    title.value = "The Church of Pentecost · Berea English Assembly";
    title.font = { bold: true, size: 12, color: { argb: NAVY } };
    const sub = sheet.getCell(2, 2);
    sub.value = definition.name;
    sub.font = { size: 11 };
    sheet.getRow(1).height = 18;
    sheet.getRow(2).height = 15;
    sheet.getRow(3).height = 8;
  }

  // Column widths.
  definition.columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.max(12, Math.min(40, c.label.length + 6));
  });

  // Header row.
  const headerRow = sheet.getRow(headerRowNo);
  definition.columns.forEach((c, i) => {
    headerRow.getCell(i + 1).value = c.label;
  });
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 20;

  // Data rows.
  rows.forEach((row, r) => {
    const excelRow = sheet.getRow(headerRowNo + 1 + r);
    definition.columns.forEach((c, i) => {
      excelRow.getCell(i + 1).value = row[c.key] ?? "";
    });
  });

  definition.columns.forEach((c, i) => {
    if (c.numeric) sheet.getColumn(i + 1).alignment = { horizontal: "right" };
  });

  // Freeze everything above the data, and filter on the header row.
  sheet.views = [{ state: "frozen", ySplit: headerRowNo }];
  sheet.autoFilter = {
    from: { row: headerRowNo, column: 1 },
    to: { row: headerRowNo, column: colCount },
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

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { toCsv, toXlsx, exportFilename } from "./export.service";
import type { ReportResult } from "./report.service";

const report = (rows: Record<string, string | number | null>[]): ReportResult => ({
  definition: {
    key: "members",
    name: "Member register",
    description: "test",
    module: "Membership",
    permission: "member.read",
    columns: [
      { key: "name", label: "Name" },
      { key: "phone", label: "Phone" },
      { key: "count", label: "Count", numeric: true },
    ],
  },
  rows,
  generatedAt: "2026-07-22T10:00:00.000Z",
});

describe("toCsv", () => {
  it("writes a header row from the column labels", () => {
    const csv = toCsv(report([]));
    expect(csv).toContain("Name,Phone,Count");
  });

  it("starts with a UTF-8 BOM so Excel reads accents correctly", () => {
    expect(toCsv(report([])).charCodeAt(0)).toBe(0xfeff);
  });

  it("writes rows in column order", () => {
    const csv = toCsv(report([{ name: "Kwame Mensah", phone: "+233244123456", count: 3 }]));
    expect(csv).toContain("Kwame Mensah,+233244123456,3");
  });

  it("quotes values containing commas", () => {
    const csv = toCsv(report([{ name: "Mensah, Kwame", phone: "", count: 0 }]));
    expect(csv).toContain('"Mensah, Kwame"');
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = toCsv(report([{ name: 'Kwame "KB" Mensah', phone: "", count: 0 }]));
    expect(csv).toContain('"Kwame ""KB"" Mensah"');
  });

  it("quotes values containing newlines", () => {
    const csv = toCsv(report([{ name: "Line1\nLine2", phone: "", count: 0 }]));
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("renders null and missing values as empty cells", () => {
    const csv = toCsv(report([{ name: null, phone: "", count: 0 }]));
    expect(csv.split("\r\n")[1]).toBe(",,0");
  });

  it("uses CRLF line endings per RFC 4180", () => {
    const csv = toCsv(report([{ name: "A", phone: "B", count: 1 }]));
    expect(csv).toContain("\r\n");
  });
});

describe("toXlsx", () => {
  it("produces a real xlsx workbook that reads back correctly", async () => {
    const buffer = await toXlsx(
      report([
        { name: "Kwame Mensah", phone: "+233244123456", count: 3 },
        { name: "Ama Owusu", phone: "+233201112222", count: 5 },
      ]),
    );

    // xlsx files are ZIP archives — check the magic bytes.
    expect(buffer.subarray(0, 2).toString()).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    // exceljs declares `load(data: Buffer)` against an older Buffer generic than
    // @types/node 22 emits; the runtime value is correct, only the types differ.
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Member register");
    expect(sheet).toBeDefined();

    // A branded title band sits above the table (crest + assembly heading).
    expect(String(sheet?.getRow(1).getCell(2).value)).toContain("Church of Pentecost");
    // Header on row 4, then the data rows beneath it.
    expect(sheet?.getRow(4).getCell(1).value).toBe("Name");
    expect(sheet?.getRow(5).getCell(1).value).toBe("Kwame Mensah");
    expect(sheet?.getRow(6).getCell(3).value).toBe(5);
    expect(sheet?.rowCount).toBe(6);
  });

  it("freezes the header row so long registers stay readable", async () => {
    const workbook = new ExcelJS.Workbook();
    const buffer = await toXlsx(report([{ name: "A", phone: "B", count: 1 }]));
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.getWorksheet("Member register")?.views?.[0]?.state).toBe("frozen");
  });
});

describe("exportFilename", () => {
  it("slugifies the report name and stamps the date", () => {
    expect(exportFilename(report([]), "csv")).toBe("member-register-2026-07-22.csv");
  });

  it("applies the requested extension", () => {
    expect(exportFilename(report([]), "xlsx")).toBe("member-register-2026-07-22.xlsx");
  });
});

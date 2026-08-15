import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseMemberWorkbook, buildImportTemplate } from "./import.service";

/** Build an .xlsx buffer from a header row + data rows for the parser to read. */
async function makeWorkbook(headers: string[], rows: (string | number | Date)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Members");
  sheet.addRow(headers);
  rows.forEach((r) => sheet.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseMemberWorkbook", () => {
  it("maps varied headers, normalizes loose values, and validates", async () => {
    const buf = await makeWorkbook(
      ["Surname", "First Name", "Sex", "Mobile", "Status", "DOB", "Water Baptized", "Favourite Colour"],
      [
        ["Mensah", "Kwame", "M", "0244123456", "New convert", "12/04/1990", "Yes", "Blue"],
        ["Owusu", "Ama", "F", "", "Member", "", "No", "Green"],
      ],
    );
    const result = await parseMemberWorkbook(buf);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(2);
    expect(result.unmappedHeaders).toContain("Favourite Colour");
    expect(result.mappedFields).toEqual(expect.arrayContaining(["first_name", "last_name"]));

    const kwame = result.valid[0]!;
    expect(kwame.first_name).toBe("Kwame");
    expect(kwame.gender).toBe("male");
    expect(kwame.current_status).toBe("new_convert");
    expect(kwame.date_of_birth).toBe("1990-04-12"); // day-first parsed
    expect(kwame.is_water_baptized).toBe(true);
  });

  it("collects per-row errors for invalid values and skips blank rows", async () => {
    const buf = await makeWorkbook(
      ["First Name", "Last Name", "Email"],
      [
        ["Yaa", "Asante", "not-an-email"],
        ["", "", ""], // blank — skipped, not counted
        ["Kofi", "Boateng", "kofi@example.com"],
      ],
    );
    const result = await parseMemberWorkbook(buf);

    expect(result.totalRows).toBe(2); // blank row skipped
    expect(result.valid).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.name).toBe("Yaa Asante");
    expect(result.errors[0]!.messages.join(" ")).toMatch(/email/i);
  });

  it("flags when required columns are absent (mappedFields lacks names)", async () => {
    const buf = await makeWorkbook(["Phone", "Email"], [["0244123456", "x@y.com"]]);
    const result = await parseMemberWorkbook(buf);
    expect(result.mappedFields).not.toContain("first_name");
  });

  it("round-trips its own template: the example row is valid", async () => {
    const template = await buildImportTemplate();
    const result = await parseMemberWorkbook(template);
    expect(result.mappedFields).toEqual(expect.arrayContaining(["first_name", "last_name", "member_no"]));
    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]!.member_no).toBe("BEA-001");
  });
});

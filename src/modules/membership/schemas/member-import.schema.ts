import { z } from "zod";
import {
  memberFormSchema,
  GENDERS,
  MARITAL_STATUSES,
  MEMBER_STATES,
} from "./member.schema";

/**
 * Bulk import mapping (docs/02 §4 — the form schema stays the single source of
 * truth for what a valid member is; this layer only maps messy spreadsheet
 * columns/values onto it). Import adds an optional member_no that the single
 * form doesn't expose, since existing registers usually carry an ID.
 */

/** The row shape we validate — the form schema plus an optional membership no. */
export const memberImportRowSchema = memberFormSchema.extend({
  member_no: z
    .string()
    .trim()
    .transform((v) => (v === "" ? undefined : v))
    .optional(),
});

export type MemberImportRow = z.output<typeof memberImportRowSchema>;

/**
 * Canonical field → accepted header labels. Matching is case-insensitive and
 * ignores punctuation/spacing, so "Date of Birth", "date_of_birth" and "DOB"
 * all land on the same field.
 */
export const COLUMN_ALIASES: Record<string, string[]> = {
  member_no: ["member no", "member number", "membership no", "membership number", "id", "member id"],
  first_name: ["first name", "firstname", "first", "given name"],
  middle_name: ["middle name", "middlename", "other names", "other name"],
  last_name: ["last name", "lastname", "surname", "family name"],
  preferred_name: ["preferred name", "nickname", "known as", "also known as"],
  gender: ["gender", "sex"],
  date_of_birth: ["date of birth", "dob", "birth date", "birthday", "birthdate"],
  marital_status: ["marital status", "marital", "marriage status"],
  wedding_anniversary: ["wedding anniversary", "anniversary", "wedding date"],
  primary_phone: ["phone", "phone number", "mobile", "mobile number", "contact", "contact number", "telephone", "primary phone", "tel"],
  primary_email: ["email", "email address", "e-mail", "primary email"],
  residential_address: ["address", "residential address", "residence", "home address"],
  gps_address: ["gps", "gps address", "ghana post gps", "digital address", "ghanapost"],
  landmark: ["landmark", "nearest landmark", "closest landmark"],
  current_status: ["status", "membership status", "current status", "member status"],
  joined_on: ["joined on", "join date", "date joined", "membership date", "date joined church", "joined"],
  occupation_title: ["occupation", "job", "profession", "occupation title", "job title"],
  employer: ["employer", "company", "workplace", "organisation", "organization"],
  notes_summary: ["notes", "remarks", "comments", "note"],
  is_water_baptized: ["water baptized", "water baptised", "baptized in water", "water baptism"],
  is_holy_spirit_baptized: ["holy spirit baptized", "holy spirit baptised", "spirit baptized", "holy ghost baptized", "holy spirit baptism"],
};

/** The columns the template is generated with, in a sensible reading order. */
export const TEMPLATE_COLUMNS: { field: string; header: string; example: string }[] = [
  { field: "member_no", header: "Member No", example: "BEA-001" },
  { field: "first_name", header: "First Name", example: "Kwame" },
  { field: "middle_name", header: "Middle Name", example: "" },
  { field: "last_name", header: "Last Name", example: "Mensah" },
  { field: "preferred_name", header: "Preferred Name", example: "" },
  { field: "gender", header: "Gender", example: "Male" },
  { field: "date_of_birth", header: "Date of Birth", example: "1990-04-12" },
  { field: "marital_status", header: "Marital Status", example: "Married" },
  { field: "wedding_anniversary", header: "Wedding Anniversary", example: "" },
  { field: "primary_phone", header: "Phone", example: "024 412 3456" },
  { field: "primary_email", header: "Email", example: "kwame@example.com" },
  { field: "residential_address", header: "Residential Address", example: "Dansoman, Accra" },
  { field: "gps_address", header: "GPS Address", example: "GA-123-4567" },
  { field: "landmark", header: "Landmark", example: "Near the market" },
  { field: "current_status", header: "Status", example: "Member" },
  { field: "joined_on", header: "Joined On", example: "2015-01-11" },
  { field: "occupation_title", header: "Occupation", example: "Teacher" },
  { field: "employer", header: "Employer", example: "Ghana Education Service" },
  { field: "is_water_baptized", header: "Water Baptized", example: "Yes" },
  { field: "is_holy_spirit_baptized", header: "Holy Spirit Baptized", example: "Yes" },
  { field: "notes_summary", header: "Notes", example: "" },
];

/** Normalize a header cell to compare against the alias lists. */
export function normalizeHeader(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Resolve a header label to a canonical field key, or null if unrecognized. */
export function fieldForHeader(rawHeader: string): string | null {
  const norm = normalizeHeader(rawHeader);
  if (!norm) return null;
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (field === norm) return field;
    if (aliases.some((a) => normalizeHeader(a) === norm)) return field;
  }
  return null;
}

const yes = new Set(["yes", "y", "true", "1", "x", "✓", "baptized", "baptised"]);
const no = new Set(["no", "n", "false", "0", "", "-"]);

/** Coerce loose spreadsheet booleans (Yes/No, Y/N, TRUE, 1, ✓). */
export function normalizeBoolean(raw: string): boolean {
  const v = raw.trim().toLowerCase();
  if (yes.has(v)) return true;
  if (no.has(v)) return false;
  return false;
}

/** "M"/"Male"/"male" → "male"; unknown → "" (schema then leaves it unset). */
export function normalizeGender(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (v === "m" || v === "male") return "male";
  if (v === "f" || v === "female") return "female";
  return GENDERS.includes(v as (typeof GENDERS)[number]) ? v : "";
}

export function normalizeMarital(raw: string): string {
  const v = raw.trim().toLowerCase();
  return MARITAL_STATUSES.includes(v as (typeof MARITAL_STATUSES)[number]) ? v : "";
}

/** Map friendly status words onto the enum; blank/unknown → "member". */
export function normalizeStatus(raw: string): string {
  const v = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const direct = MEMBER_STATES.find((s) => s === v);
  if (direct) return direct;
  const map: Record<string, string> = {
    new: "new_convert",
    convert: "new_convert",
    newconvert: "new_convert",
    active: "member",
    transferred: "transferred_out",
    transfer: "transferred_out",
    dead: "deceased",
  };
  return map[v] ?? (v === "" ? "member" : "member");
}

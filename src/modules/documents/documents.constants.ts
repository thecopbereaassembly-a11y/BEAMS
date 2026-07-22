/** Client-safe document constants (the module file is `server-only`). */
export const VISIBILITIES = ["private", "leaders", "assembly"] as const;

export const VISIBILITY_LABELS: Record<(typeof VISIBILITIES)[number], string> = {
  private: "Private (admins only)",
  leaders: "Leaders",
  assembly: "Whole assembly",
};

export function formatBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

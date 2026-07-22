/**
 * Client-safe constants for the prayer module. See care.constants.ts for why
 * these live apart from the `server-only` module file.
 */
export const PRIVACY_LEVELS = ["public", "leaders_only", "private"] as const;
export const PRAYER_STATUSES = ["open", "praying", "answered", "closed"] as const;

export const PRIVACY_LABELS: Record<(typeof PRIVACY_LEVELS)[number], string> = {
  public: "Prayer wall (everyone)",
  leaders_only: "Leaders only",
  private: "Private",
};

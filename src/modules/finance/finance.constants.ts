/** Client-safe finance constants (see care.constants.ts for why these are split out). */

export const CHANNELS = ["momo", "cash", "bank", "cheque", "card", "other"] as const;
export const MOMO_NETWORKS = ["mtn", "telecel", "airteltigo"] as const;

export const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  momo: "Mobile Money",
  cash: "Cash",
  bank: "Bank transfer",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

export const NETWORK_LABELS: Record<(typeof MOMO_NETWORKS)[number], string> = {
  mtn: "MTN MoMo",
  telecel: "Telecel Cash",
  airteltigo: "AirtelTigo Money",
};

/** Formats an amount as Ghana Cedis. */
export function ghs(amount: number | string | null): string {
  const value = amount === null ? 0 : Number(amount);
  return new Intl.NumberFormat("en-GH", {
    style: "currency",
    currency: "GHS",
  }).format(Number.isFinite(value) ? value : 0);
}

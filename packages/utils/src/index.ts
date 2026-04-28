export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

export const createStableId = (prefix: string, label: string, fallback = "item"): string => {
  const base = slugify(label || fallback) || fallback;
  return `${prefix}-${base}`;
};

export const nowIso = (): string => new Date().toISOString();

export { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";
export type { SupabaseClient } from "./supabaseClient";

export {
  getDaysUntilExpiration,
  getFundingStatus,
  isFundingSourceAssignable,
  fundingVisibilityLabel,
  confidenceReason,
} from "./funding";
export type {
  FundingSourceRecord,
  FundingDefaultRecord,
  FundingVisibility,
  FundingAssignmentStatus,
  FundingConfidenceLevel,
  FundingStatus,
  FundingStatusKind,
} from "./funding";

export const safeJsonParse = <T>(text: string): { ok: true; value: T } | { ok: false; error: string } => {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown JSON parse error" };
  }
};

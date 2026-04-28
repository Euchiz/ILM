// Shared funding-directory types and status helpers.
//
// The Funding Directory is a privacy-preserving alias book — nothing in this
// module models budgets, balances, or financial activity. Funding records
// describe HOW an approved order maps to a grant identifier, nothing more.

export type FundingVisibility = "reviewer_only" | "lab_visible_alias";

export type FundingAssignmentStatus =
  | "unassigned"
  | "suggested"
  | "assigned"
  | "changed"
  | "not_required";

export type FundingConfidenceLevel =
  | "exact_item_project"
  | "exact_item"
  | "category_project"
  | "project_default";

// Directory rows are returned by list_funding_sources. Members get
// grant_identifier null + caller_can_see_grant_identifier = false; admins get
// the real grant id and the flag set true. Same row shape for both tiers.
export interface FundingSourceRecord {
  id: string;
  lab_id: string;
  nickname: string;
  grant_identifier: string | null;
  pi_id: string | null;
  valid_start_date: string | null;
  valid_end_date: string | null;
  brief_note: string | null;
  visibility: FundingVisibility;
  archived_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  caller_can_see_grant_identifier: boolean;
}

export interface FundingDefaultRecord {
  id: string;
  lab_id: string;
  funding_source_id: string;
  item_id: string | null;
  project_id: string | null;
  category: string | null;
  confidence_level: FundingConfidenceLevel;
  set_by_user_id: string | null;
  last_used_order_id: string | null;
  last_used_at: string;
  created_at: string;
  updated_at: string;
}

// Status badges. The DB only stores `archived_at`; everything else is computed
// off the validity window. Two warning tiers are layered on top of the four
// canonical states so reviewers see "ending in 18 days" not just "expiring".
export type FundingStatusKind =
  | "active"
  | "expiring_soon"   // 31-60 days out
  | "ending_soon"     // <=30 days out
  | "expired"
  | "archived"
  | "no_window";      // no valid_end_date set

export interface FundingStatus {
  kind: FundingStatusKind;
  daysUntilExpiration: number | null;
  label: string;
  badgeTone: "neutral" | "info" | "success" | "warning" | "danger";
}

const MS_PER_DAY = 86_400_000;

const startOfUtcDay = (input: Date): Date => {
  const out = new Date(input);
  out.setUTCHours(0, 0, 0, 0);
  return out;
};

export const getDaysUntilExpiration = (
  source: Pick<FundingSourceRecord, "valid_end_date">,
  now: Date = new Date()
): number | null => {
  if (!source.valid_end_date) return null;
  const end = startOfUtcDay(new Date(`${source.valid_end_date}T00:00:00Z`));
  const today = startOfUtcDay(now);
  return Math.round((end.getTime() - today.getTime()) / MS_PER_DAY);
};

export const getFundingStatus = (
  source: Pick<FundingSourceRecord, "valid_end_date" | "archived_at">,
  now: Date = new Date()
): FundingStatus => {
  if (source.archived_at) {
    return { kind: "archived", daysUntilExpiration: null, label: "Archived", badgeTone: "neutral" };
  }
  const days = getDaysUntilExpiration(source, now);
  if (days === null) {
    return { kind: "no_window", daysUntilExpiration: null, label: "Active", badgeTone: "success" };
  }
  if (days < 0) {
    return { kind: "expired", daysUntilExpiration: days, label: "Expired", badgeTone: "danger" };
  }
  if (days <= 30) {
    return {
      kind: "ending_soon",
      daysUntilExpiration: days,
      label: days === 0 ? "Ends today" : `Ending in ${days} day${days === 1 ? "" : "s"}`,
      badgeTone: "danger",
    };
  }
  if (days <= 60) {
    return {
      kind: "expiring_soon",
      daysUntilExpiration: days,
      label: `Expiring soon (${days}d)`,
      badgeTone: "warning",
    };
  }
  return { kind: "active", daysUntilExpiration: days, label: "Active", badgeTone: "success" };
};

// True when a funding source is safe to assign to a NEW approval. Archived
// and expired sources are read-only history.
export const isFundingSourceAssignable = (
  source: Pick<FundingSourceRecord, "valid_end_date" | "archived_at">,
  now: Date = new Date()
): boolean => {
  const status = getFundingStatus(source, now);
  return status.kind !== "archived" && status.kind !== "expired";
};

export const fundingVisibilityLabel = (visibility: FundingVisibility): string =>
  visibility === "reviewer_only" ? "Reviewer only" : "Lab-visible alias";

export const confidenceReason = (level: FundingConfidenceLevel): string => {
  switch (level) {
    case "exact_item_project":
      return "Previously approved for this item under this project.";
    case "exact_item":
      return "Previously approved for this item.";
    case "category_project":
      return "Previously used for similar items in this project.";
    case "project_default":
      return "Project default funding source.";
  }
};

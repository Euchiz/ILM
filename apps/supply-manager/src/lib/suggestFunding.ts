import {
  confidenceReason,
  getFundingStatus,
  isFundingSourceAssignable,
  type FundingConfidenceLevel,
  type FundingDefaultRecord,
  type FundingSourceRecord,
  type FundingStatus,
} from "@ilm/utils";
import type { ItemRecord, OrderRequestItemRecord, OrderRequestRecord } from "./cloudAdapter";

export interface FundingSuggestion {
  fundingSource: FundingSourceRecord;
  confidence: FundingConfidenceLevel;
  reason: string;
  status: FundingStatus;
  /** True if the matched record points at an archived/expired source — UI must
   *  flag this and force the reviewer to pick a fresh one. */
  invalid: boolean;
}

interface SuggestInput {
  request: OrderRequestRecord;
  requestItems: OrderRequestItemRecord[];
  itemsById: Map<string, ItemRecord>;
  fundingSources: FundingSourceRecord[];
  fundingDefaults: FundingDefaultRecord[];
}

const CONFIDENCE_PRIORITY: Record<FundingConfidenceLevel, number> = {
  exact_item_project: 0,
  exact_item: 1,
  category_project: 2,
  project_default: 3,
};

/**
 * Suggest a funding source for an order request given the lab's history.
 *
 * Priority (best → worst):
 *   1. exact (item, project)
 *   2. item (any project)
 *   3. (category, project)
 *   4. project default
 *
 * Returns null when no historical default applies. If the best historical
 * match points at an archived or expired funding source we still return it
 * (so the UI can show "previously used X — now expired") but flag invalid
 * so the reviewer is forced to pick a fresh source.
 */
export function suggestFundingSourceForOrder(input: SuggestInput): FundingSuggestion | null {
  const { request, requestItems, itemsById, fundingSources, fundingDefaults } = input;
  if (fundingSources.length === 0 || fundingDefaults.length === 0) return null;

  const sourcesById = new Map(fundingSources.map((s) => [s.id, s]));
  const projectId = request.project_id;
  const labId = request.lab_id;

  // Walk every line item and collect every default that could match. Sort by
  // confidence priority, then by recency. Take the head.
  type Candidate = { def: FundingDefaultRecord; confidence: FundingConfidenceLevel };
  const candidates: Candidate[] = [];

  for (const ri of requestItems) {
    const item = itemsById.get(ri.item_id);
    if (!item) continue;
    for (const def of fundingDefaults) {
      if (def.lab_id !== labId) continue;

      // Tier 1: exact item + project (matches request's project; null counts
      // when the default was set with no project either).
      if (
        def.item_id === item.id &&
        def.project_id === projectId &&
        def.category === null
      ) {
        candidates.push({
          def,
          confidence: projectId ? "exact_item_project" : "exact_item",
        });
        continue;
      }

      // Tier 2: item-only (regardless of request project).
      if (def.item_id === item.id && def.project_id === null && def.category === null) {
        candidates.push({ def, confidence: "exact_item" });
        continue;
      }

      // Tier 3: same category in this project.
      if (
        projectId &&
        def.item_id === null &&
        def.project_id === projectId &&
        def.category === item.classification
      ) {
        candidates.push({ def, confidence: "category_project" });
        continue;
      }

      // Tier 4: project default.
      if (
        projectId &&
        def.item_id === null &&
        def.project_id === projectId &&
        def.category === null
      ) {
        candidates.push({ def, confidence: "project_default" });
      }
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const pri = CONFIDENCE_PRIORITY[a.confidence] - CONFIDENCE_PRIORITY[b.confidence];
    if (pri !== 0) return pri;
    return Date.parse(b.def.last_used_at) - Date.parse(a.def.last_used_at);
  });

  const best = candidates[0]!;
  const fundingSource = sourcesById.get(best.def.funding_source_id);
  if (!fundingSource) return null;

  const status = getFundingStatus(fundingSource);
  const invalid = !isFundingSourceAssignable(fundingSource);
  return {
    fundingSource,
    confidence: best.confidence,
    reason: confidenceReason(best.confidence),
    status,
    invalid,
  };
}

import {
  getSupabaseClient,
  type FundingSourceRecord,
  type FundingVisibility,
} from "@ilm/utils";
import { listLabMembers, type LabMemberRecord } from "@ilm/ui";

export type LabMemberOption = LabMemberRecord;

export interface FundingWorkspaceSnapshot {
  fundingSources: FundingSourceRecord[];
  labMembers: LabMemberOption[];
}

const client = () => getSupabaseClient();

// Hydrate everything the directory needs in one round-trip set. Lab member
// loading is best-effort — non-admins may not have read access to the member
// list, but they don't need the PI dropdown either.
export async function listFundingWorkspace(labId: string): Promise<FundingWorkspaceSnapshot> {
  const [fundingResult, members] = await Promise.all([
    client().rpc("list_funding_sources", { p_lab_id: labId }),
    listLabMembers(labId).catch(() => [] as LabMemberRecord[]),
  ]);

  if (fundingResult.error) throw fundingResult.error;

  const fundingSources = (fundingResult.data as FundingSourceRecord[] | null) ?? [];
  return { fundingSources, labMembers: members };
}

// ---------------------------------------------------------------------------
// Mutation RPC wrappers. Every write goes through a SECURITY DEFINER RPC so
// audit entries land for free.
// ---------------------------------------------------------------------------

export interface CreateFundingSourceInput {
  labId: string;
  nickname: string;
  grantIdentifier: string;
  piId?: string | null;
  validStartDate?: string | null;
  validEndDate?: string | null;
  briefNote?: string | null;
  visibility?: FundingVisibility;
}

export async function createFundingSource(
  input: CreateFundingSourceInput
): Promise<FundingSourceRecord> {
  const { data, error } = await client()
    .rpc("create_funding_source", {
      p_lab_id: input.labId,
      p_nickname: input.nickname,
      p_grant_identifier: input.grantIdentifier,
      p_pi_id: input.piId ?? null,
      p_valid_start_date: input.validStartDate ?? null,
      p_valid_end_date: input.validEndDate ?? null,
      p_brief_note: input.briefNote ?? null,
      p_visibility: input.visibility ?? "reviewer_only",
    })
    .single();
  if (error) throw error;
  // The RPC returns the underlying funding_sources row (full grant_identifier
  // because the caller is by definition an admin). Re-shape into the
  // FundingSourceRecord contract with the visibility flag set true.
  return shapeRpcRow(data, true);
}

export interface UpdateFundingSourceInput {
  id: string;
  nickname?: string;
  grantIdentifier?: string;
  piId?: string | null;
  clearPi?: boolean;
  validStartDate?: string | null;
  clearValidStart?: boolean;
  validEndDate?: string | null;
  clearValidEnd?: boolean;
  briefNote?: string | null;
  clearBriefNote?: boolean;
  visibility?: FundingVisibility;
}

export async function updateFundingSource(
  input: UpdateFundingSourceInput
): Promise<FundingSourceRecord> {
  const { data, error } = await client()
    .rpc("update_funding_source", {
      p_id: input.id,
      p_nickname: input.nickname ?? null,
      p_grant_identifier: input.grantIdentifier ?? null,
      p_pi_id: input.piId ?? null,
      p_clear_pi: input.clearPi ?? false,
      p_valid_start_date: input.validStartDate ?? null,
      p_clear_valid_start: input.clearValidStart ?? false,
      p_valid_end_date: input.validEndDate ?? null,
      p_clear_valid_end: input.clearValidEnd ?? false,
      p_brief_note: input.briefNote ?? null,
      p_clear_brief_note: input.clearBriefNote ?? false,
      p_visibility: input.visibility ?? null,
    })
    .single();
  if (error) throw error;
  return shapeRpcRow(data, true);
}

export async function archiveFundingSource(id: string): Promise<FundingSourceRecord> {
  const { data, error } = await client()
    .rpc("archive_funding_source", { p_id: id })
    .single();
  if (error) throw error;
  return shapeRpcRow(data, true);
}

export async function restoreFundingSource(id: string): Promise<FundingSourceRecord> {
  const { data, error } = await client()
    .rpc("restore_funding_source", { p_id: id })
    .single();
  if (error) throw error;
  return shapeRpcRow(data, true);
}

// The funding_sources row returned by mutation RPCs lacks the
// caller_can_see_grant_identifier flag that list_funding_sources includes.
// We know mutations are admin-only so the caller can always see the grant id.
function shapeRpcRow(raw: unknown, callerIsAdmin: boolean): FundingSourceRecord {
  const r = raw as Record<string, unknown>;
  return {
    id: String(r.id),
    lab_id: String(r.lab_id),
    nickname: String(r.nickname),
    grant_identifier: (r.grant_identifier as string | null) ?? null,
    pi_id: (r.pi_id as string | null) ?? null,
    valid_start_date: (r.valid_start_date as string | null) ?? null,
    valid_end_date: (r.valid_end_date as string | null) ?? null,
    brief_note: (r.brief_note as string | null) ?? null,
    visibility: r.visibility as FundingVisibility,
    archived_at: (r.archived_at as string | null) ?? null,
    created_by: (r.created_by as string | null) ?? null,
    updated_by: (r.updated_by as string | null) ?? null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    caller_can_see_grant_identifier: callerIsAdmin,
  };
}

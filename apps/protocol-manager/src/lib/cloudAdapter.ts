import type { ProtocolDocument } from "@ilm/types";
import { getSupabaseClient } from "@ilm/utils";

/** Shape returned from public.protocols + derived fields we care about. */
export interface CloudProtocolRow {
  id: string;
  lab_id: string;
  project_id: string | null;
  title: string;
  document_json: ProtocolDocument;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CloudDraftRow {
  id: string;
  lab_id: string;
  project_id: string | null;
  protocol_id: string | null;
  user_id: string;
  document_json: ProtocolDocument;
  updated_at: string;
}

export interface CloudProjectRow {
  id: string;
  lab_id: string;
  name: string;
  approval_required: boolean;
}

const client = () => getSupabaseClient();

export async function listProjects(labId: string): Promise<CloudProjectRow[]> {
  const { data, error } = await client()
    .from("projects")
    .select("id, lab_id, name, approval_required")
    .eq("lab_id", labId)
    .order("name");
  if (error) throw error;
  return (data as CloudProjectRow[]) ?? [];
}

export async function listProtocols(labId: string): Promise<CloudProtocolRow[]> {
  const { data, error } = await client()
    .from("protocols")
    .select(
      "id, lab_id, project_id, title, document_json, created_by, updated_by, created_at, updated_at, deleted_at"
    )
    .eq("lab_id", labId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as CloudProtocolRow[]) ?? [];
}

export async function listDrafts(labId: string): Promise<CloudDraftRow[]> {
  const { data, error } = await client()
    .from("protocol_drafts")
    .select("id, lab_id, project_id, protocol_id, user_id, document_json, updated_at")
    .eq("lab_id", labId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as CloudDraftRow[]) ?? [];
}

/**
 * Upsert the caller's draft for an existing protocol (pass protocolId), or
 * create/update a draft for a brand-new protocol (pass draftId or null).
 * Returns the draft id.
 */
export async function saveDraft(args: {
  protocolId: string | null;
  projectId: string;
  document: ProtocolDocument;
  draftId?: string | null;
}): Promise<string> {
  const { data, error } = await client().rpc("save_draft", {
    p_protocol_id: args.protocolId,
    p_project_id: args.projectId,
    p_document: args.document,
    p_draft_id: args.draftId ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function discardDraft(draftId: string): Promise<void> {
  const { error } = await client().rpc("discard_draft", { p_draft_id: draftId });
  if (error) throw error;
}

/**
 * Submit a draft. Returns the submission id. If the target project has
 * approval_required=false (e.g. the default General project), this also
 * publishes immediately.
 */
export async function submitDraft(draftId: string): Promise<string> {
  const { data, error } = await client().rpc("submit_draft", { p_draft_id: draftId });
  if (error) throw error;
  return data as string;
}

export async function approveSubmission(submissionId: string, comment?: string): Promise<string> {
  const { data, error } = await client().rpc("approve_submission", {
    p_submission_id: submissionId,
    p_comment: comment ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function rejectSubmission(submissionId: string, comment?: string): Promise<void> {
  const { error } = await client().rpc("reject_submission", {
    p_submission_id: submissionId,
    p_comment: comment ?? null,
  });
  if (error) throw error;
}

export async function softDeleteProtocol(protocolId: string): Promise<void> {
  const { error } = await client().rpc("soft_delete_protocol", { p_id: protocolId });
  if (error) throw error;
}

export async function restoreProtocol(protocolId: string): Promise<void> {
  const { error } = await client().rpc("restore_protocol", { p_id: protocolId });
  if (error) throw error;
}

export async function permanentDeleteProtocol(protocolId: string): Promise<void> {
  const { error } = await client().rpc("permanent_delete_protocol", { p_id: protocolId });
  if (error) throw error;
}

export async function listDeletedProtocols(labId: string): Promise<CloudProtocolRow[]> {
  const { data, error } = await client().rpc("list_deleted_protocols", { p_lab_id: labId });
  if (error) throw error;
  return (data as CloudProtocolRow[]) ?? [];
}

export interface CloudSubmissionRow {
  id: string;
  lab_id: string;
  project_id: string;
  protocol_id: string | null;
  submitter_id: string | null;
  document_json: ProtocolDocument;
  status: "pending" | "approved" | "rejected" | "withdrawn";
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
}

export async function listSubmissions(
  labId: string,
  statuses: CloudSubmissionRow["status"][] = ["pending"]
): Promise<CloudSubmissionRow[]> {
  const { data, error } = await client()
    .from("protocol_submissions")
    .select(
      "id, lab_id, project_id, protocol_id, submitter_id, document_json, status, review_comment, reviewed_by, reviewed_at, submitted_at"
    )
    .eq("lab_id", labId)
    .in("status", statuses)
    .order("submitted_at", { ascending: false });
  if (error) throw error;
  return (data as CloudSubmissionRow[]) ?? [];
}

export async function withdrawSubmission(submissionId: string): Promise<void> {
  const { error } = await client().rpc("withdraw_submission", { p_submission_id: submissionId });
  if (error) throw error;
}

export interface CloudProjectLeadRow {
  project_id: string;
  user_id: string;
}

export async function listProjectLeads(labId: string): Promise<CloudProjectLeadRow[]> {
  const { data, error } = await client()
    .from("project_leads")
    .select("project_id, user_id, projects!inner(lab_id)")
    .eq("projects.lab_id", labId);
  if (error) throw error;
  type Row = CloudProjectLeadRow & { projects?: unknown };
  return ((data as Row[]) ?? []).map(({ project_id, user_id }) => ({ project_id, user_id }));
}

export async function assignProjectLead(projectId: string, userId: string): Promise<void> {
  const { error } = await client().rpc("assign_project_lead", {
    p_project_id: projectId,
    p_user_id: userId,
  });
  if (error) throw error;
}

export async function revokeProjectLead(projectId: string, userId: string): Promise<void> {
  const { error } = await client().rpc("revoke_project_lead", {
    p_project_id: projectId,
    p_user_id: userId,
  });
  if (error) throw error;
}

import { getSupabaseClient } from "@ilm/utils";
import type { MembershipRole } from "../auth/types";

export type LabMemberRecord = {
  user_id: string;
  role: MembershipRole;
  display_name: string | null;
  email: string | null;
  joined_at: string;
};

export type LabInvitationRecord = {
  id: string;
  lab_id: string;
  email: string;
  role: "admin" | "member";
  status: "pending" | "accepted" | "revoked";
  invited_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  approval_required: boolean;
};

export type ProjectLeadRecord = {
  project_id: string;
  user_id: string;
};

export type LabJoinRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export type LabJoinRequestRecord = {
  id: string;
  lab_id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  message: string | null;
  status: LabJoinRequestStatus;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type LabLookupResult = {
  id: string;
  name: string;
  already_member: boolean;
  has_pending_request: boolean;
};

const client = () => getSupabaseClient();

export const listLabMembers = async (labId: string): Promise<LabMemberRecord[]> => {
  const { data, error } = await client().rpc("list_lab_members", { p_lab_id: labId });
  if (error) throw error;
  return (data as LabMemberRecord[]) ?? [];
};

export const removeLabMember = async (labId: string, userId: string) => {
  const { error } = await client().rpc("remove_lab_member", {
    p_lab_id: labId,
    p_user_id: userId,
  });
  if (error) throw error;
};

export const listLabInvitations = async (labId: string): Promise<LabInvitationRecord[]> => {
  const { data, error } = await client()
    .from("lab_invitations")
    .select("id, lab_id, email, role, status, invited_by, created_at, updated_at")
    .eq("lab_id", labId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as LabInvitationRecord[]) ?? [];
};

export const inviteMemberToLab = async (labId: string, email: string, role: "admin" | "member") => {
  const { data, error } = await client().rpc("invite_member_to_lab", {
    p_lab_id: labId,
    p_email: email,
    p_role: role,
  });
  if (error) throw error;
  return data as string;
};

export const listProjects = async (labId: string): Promise<ProjectRecord[]> => {
  const { data, error } = await client()
    .from("projects")
    .select("id, name, approval_required")
    .eq("lab_id", labId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as ProjectRecord[]) ?? [];
};

export const listProjectLeads = async (projectId: string): Promise<ProjectLeadRecord[]> => {
  const { data, error } = await client()
    .from("project_leads")
    .select("project_id, user_id")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data as ProjectLeadRecord[]) ?? [];
};

export const assignProjectLead = async (projectId: string, userId: string) => {
  const { error } = await client().rpc("assign_project_lead", {
    p_project_id: projectId,
    p_user_id: userId,
  });
  if (error) throw error;
};

export const revokeProjectLead = async (projectId: string, userId: string) => {
  const { error } = await client().rpc("revoke_project_lead", {
    p_project_id: projectId,
    p_user_id: userId,
  });
  if (error) throw error;
};

export const promoteMemberToAdmin = async (labId: string, userId: string) => {
  const { error } = await client().rpc("promote_member_to_admin", {
    p_lab_id: labId,
    p_user_id: userId,
  });
  if (error) throw error;
};

export const demoteAdminToMember = async (labId: string, userId: string) => {
  const { error } = await client().rpc("demote_admin_to_member", {
    p_lab_id: labId,
    p_user_id: userId,
  });
  if (error) throw error;
};

export const lookupLabById = async (labId: string): Promise<LabLookupResult | null> => {
  const { data, error } = await client()
    .rpc("lookup_lab_by_id", { p_lab_id: labId })
    .maybeSingle();
  if (error) throw error;
  return (data as LabLookupResult) ?? null;
};

export const requestLabJoin = async (labId: string, message?: string): Promise<string> => {
  const { data, error } = await client().rpc("request_lab_join", {
    p_lab_id: labId,
    p_message: message ?? null,
  });
  if (error) throw error;
  return data as string;
};

export const listLabJoinRequests = async (
  labId: string,
  status: LabJoinRequestStatus | null = "pending"
): Promise<LabJoinRequestRecord[]> => {
  const { data, error } = await client().rpc("list_lab_join_requests", {
    p_lab_id: labId,
    p_status: status,
  });
  if (error) throw error;
  return (data as LabJoinRequestRecord[]) ?? [];
};

export const approveLabJoin = async (requestId: string) => {
  const { error } = await client().rpc("approve_lab_join", { p_request_id: requestId });
  if (error) throw error;
};

export const rejectLabJoin = async (requestId: string, comment: string) => {
  const { error } = await client().rpc("reject_lab_join", {
    p_request_id: requestId,
    p_comment: comment,
  });
  if (error) throw error;
};

export const cancelLabJoin = async (requestId: string) => {
  const { error } = await client().rpc("cancel_lab_join", { p_request_id: requestId });
  if (error) throw error;
};

export const claimPendingInvitations = async (): Promise<number> => {
  const { data, error } = await client().rpc("claim_pending_invitations");
  if (error) throw error;
  return (data as number) ?? 0;
};

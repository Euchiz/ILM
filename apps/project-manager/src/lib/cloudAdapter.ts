import { getSupabaseClient } from "@ilm/utils";

export type ProjectStatus = "planning" | "active" | "blocked" | "completed" | "archived";
export type ProjectState = "draft" | "published" | "deleted";
export type MilestoneStatus = "planned" | "in_progress" | "done" | "cancelled";
export type ExperimentStatus = "planned" | "running" | "completed" | "failed";

export interface SubmissionHistoryEntryRecord {
  type: string;
  actor?: string | null;
  at?: string | null;
  comment?: string | null;
}

export interface ProjectRecord {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  status: string | null;
  state: ProjectState;
  deleted_at: string | null;
  review_requested_at: string | null;
  review_requested_by: string | null;
  approval_required: boolean;
  submission_history: SubmissionHistoryEntryRecord[] | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneRecord {
  id: string;
  lab_id: string;
  project_id: string;
  sort_order: number;
  title: string;
  description: string | null;
  due_date: string | null;
  status: MilestoneStatus;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExperimentRecord {
  id: string;
  lab_id: string;
  project_id: string;
  milestone_id: string | null;
  sort_order: number;
  protocol_id: string | null;
  title: string;
  notes: string | null;
  status: ExperimentStatus;
  started_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProtocolOptionRecord {
  id: string;
  project_id: string | null;
  title: string;
  updated_at: string;
}

export interface ProjectLeadLinkRecord {
  project_id: string;
  user_id: string;
}

export interface ProjectWorkspaceSnapshot {
  projects: ProjectRecord[];
  milestones: MilestoneRecord[];
  experiments: ExperimentRecord[];
  protocols: ProtocolOptionRecord[];
  leads: ProjectLeadLinkRecord[];
}

const client = () => getSupabaseClient();

const PROJECT_FIELDS =
  "id, lab_id, name, description, status, state, deleted_at, review_requested_at, review_requested_by, approval_required, submission_history, created_by, updated_by, created_at, updated_at";

const MILESTONE_FIELDS =
  "id, lab_id, project_id, sort_order, title, description, due_date, status, created_by, updated_by, created_at, updated_at";

const EXPERIMENT_FIELDS =
  "id, lab_id, project_id, milestone_id, sort_order, protocol_id, title, notes, status, started_at, completed_at, created_by, updated_by, created_at, updated_at";

export async function listProjectWorkspace(labId: string): Promise<ProjectWorkspaceSnapshot> {
  const [projectsResult, milestonesResult, experimentsResult, protocolsResult, leadsResult] = await Promise.all([
    client().from("projects").select(PROJECT_FIELDS).eq("lab_id", labId).order("name", { ascending: true }),
    client().from("milestones").select(MILESTONE_FIELDS).eq("lab_id", labId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    client().from("experiments").select(EXPERIMENT_FIELDS).eq("lab_id", labId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    client().from("protocols").select("id, project_id, title, updated_at").eq("lab_id", labId).order("updated_at", { ascending: false }),
    client().from("project_leads").select("project_id, user_id, projects!inner(lab_id)").eq("projects.lab_id", labId),
  ]);

  if (projectsResult.error) throw projectsResult.error;
  if (milestonesResult.error) throw milestonesResult.error;
  if (experimentsResult.error) throw experimentsResult.error;
  if (protocolsResult.error) throw protocolsResult.error;
  if (leadsResult.error) throw leadsResult.error;

  const leads = ((leadsResult.data ?? []) as Array<{ project_id: string; user_id: string }>).map((row) => ({
    project_id: row.project_id,
    user_id: row.user_id,
  }));

  return {
    projects: (projectsResult.data as ProjectRecord[]) ?? [],
    milestones: (milestonesResult.data as MilestoneRecord[]) ?? [],
    experiments: (experimentsResult.data as ExperimentRecord[]) ?? [],
    protocols: (protocolsResult.data as ProtocolOptionRecord[]) ?? [],
    leads,
  };
}

export async function listDeletedProjects(labId: string): Promise<ProjectRecord[]> {
  const { data, error } = await client().rpc("list_deleted_projects", { p_lab_id: labId });
  if (error) throw error;
  return (data as ProjectRecord[]) ?? [];
}

// ---------------------------------------------------------------------------
// Review workflow RPCs
// ---------------------------------------------------------------------------

export async function createProjectDraft(args: {
  labId: string;
  name: string;
  description?: string;
  status?: ProjectStatus | null;
  approvalRequired?: boolean;
}): Promise<ProjectRecord> {
  const { data, error } = await client()
    .rpc("create_project_draft", {
      p_lab_id: args.labId,
      p_name: args.name,
      p_description: args.description?.trim() || null,
      p_approval_required: args.approvalRequired ?? true,
      p_status: args.status ?? "planning",
    })
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

export async function withdrawProjectDraft(projectId: string): Promise<void> {
  const { error } = await client().rpc("withdraw_project_draft", { p_project_id: projectId });
  if (error) throw error;
}

export async function approveProject(projectId: string, comment?: string | null): Promise<ProjectRecord> {
  const { data, error } = await client()
    .rpc("approve_project", { p_project_id: projectId, p_comment: comment ?? null })
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

export async function submitProjectForReview(
  projectId: string,
  comment?: string | null
): Promise<ProjectRecord> {
  const { data, error } = await client()
    .rpc("submit_project_for_review", { p_project_id: projectId, p_comment: comment ?? null })
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

export async function rejectProject(projectId: string, comment: string): Promise<ProjectRecord> {
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("Rejection requires a comment.");
  const { data, error } = await client()
    .rpc("reject_project", { p_project_id: projectId, p_comment: trimmed })
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

export async function recycleProject(projectId: string): Promise<ProjectRecord> {
  const { data, error } = await client()
    .rpc("recycle_project", { p_project_id: projectId })
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

export async function restoreProject(projectId: string): Promise<ProjectRecord> {
  const { data, error } = await client()
    .rpc("restore_project", { p_project_id: projectId })
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

export async function permanentDeleteProject(projectId: string): Promise<void> {
  const { error } = await client().rpc("permanent_delete_project", { p_project_id: projectId });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Project metadata edit (published and own-drafts, gated by RLS)
// ---------------------------------------------------------------------------

export async function updateProject(args: {
  projectId: string;
  userId: string;
  name: string;
  description?: string;
  status?: string;
  approvalRequired: boolean;
}): Promise<ProjectRecord> {
  const { data, error } = await client()
    .from("projects")
    .update({
      name: args.name,
      description: args.description?.trim() || null,
      status: args.status?.trim() || null,
      approval_required: args.approvalRequired,
      updated_by: args.userId,
    })
    .eq("id", args.projectId)
    .select(PROJECT_FIELDS)
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function createMilestone(args: {
  labId: string;
  projectId: string;
  userId: string;
  sortOrder?: number;
  title: string;
  description?: string;
  dueDate?: string | null;
  status?: MilestoneStatus;
}): Promise<MilestoneRecord> {
  const { data, error } = await client()
    .from("milestones")
    .insert({
      lab_id: args.labId,
      project_id: args.projectId,
      sort_order: args.sortOrder ?? 1024,
      title: args.title,
      description: args.description?.trim() || null,
      due_date: args.dueDate ?? null,
      status: args.status ?? "planned",
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select(MILESTONE_FIELDS)
    .single();
  if (error) throw error;
  return data as MilestoneRecord;
}

export async function updateMilestone(args: {
  milestoneId: string;
  userId: string;
  sortOrder?: number;
  title: string;
  description?: string;
  dueDate?: string | null;
  status: MilestoneStatus;
}): Promise<MilestoneRecord> {
  const { data, error } = await client()
    .from("milestones")
    .update({
      sort_order: args.sortOrder,
      title: args.title,
      description: args.description?.trim() || null,
      due_date: args.dueDate ?? null,
      status: args.status,
      updated_by: args.userId,
    })
    .eq("id", args.milestoneId)
    .select(MILESTONE_FIELDS)
    .single();
  if (error) throw error;
  return data as MilestoneRecord;
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  const { error } = await client().from("milestones").delete().eq("id", milestoneId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Experiments
// ---------------------------------------------------------------------------

export async function createExperiment(args: {
  labId: string;
  projectId: string;
  userId: string;
  milestoneId?: string | null;
  sortOrder?: number;
  title: string;
  notes?: string;
  protocolId?: string | null;
  status?: ExperimentStatus;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<ExperimentRecord> {
  const { data, error } = await client()
    .from("experiments")
    .insert({
      lab_id: args.labId,
      project_id: args.projectId,
      milestone_id: args.milestoneId ?? null,
      sort_order: args.sortOrder ?? 1024,
      protocol_id: args.protocolId ?? null,
      title: args.title,
      notes: args.notes?.trim() || null,
      status: args.status ?? "planned",
      started_at: args.startedAt ?? null,
      completed_at: args.completedAt ?? null,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select(EXPERIMENT_FIELDS)
    .single();
  if (error) throw error;
  return data as ExperimentRecord;
}

export async function updateExperiment(args: {
  experimentId: string;
  userId: string;
  milestoneId?: string | null;
  sortOrder?: number;
  title: string;
  notes?: string;
  protocolId?: string | null;
  status: ExperimentStatus;
  startedAt?: string | null;
  completedAt?: string | null;
}): Promise<ExperimentRecord> {
  const { data, error } = await client()
    .from("experiments")
    .update({
      milestone_id: args.milestoneId ?? null,
      sort_order: args.sortOrder,
      protocol_id: args.protocolId ?? null,
      title: args.title,
      notes: args.notes?.trim() || null,
      status: args.status,
      started_at: args.startedAt ?? null,
      completed_at: args.completedAt ?? null,
      updated_by: args.userId,
    })
    .eq("id", args.experimentId)
    .select(EXPERIMENT_FIELDS)
    .single();
  if (error) throw error;
  return data as ExperimentRecord;
}

export async function deleteExperiment(experimentId: string): Promise<void> {
  const { error } = await client().from("experiments").delete().eq("id", experimentId);
  if (error) throw error;
}

export async function reorderMilestones(args: {
  userId: string;
  items: Array<{ milestoneId: string; sortOrder: number }>;
}): Promise<void> {
  const updates = await Promise.all(
    args.items.map(({ milestoneId, sortOrder }) =>
      client()
        .from("milestones")
        .update({ sort_order: sortOrder, updated_by: args.userId })
        .eq("id", milestoneId)
    )
  );
  const failed = updates.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

export async function reorderExperiments(args: {
  userId: string;
  items: Array<{ experimentId: string; milestoneId: string | null; sortOrder: number }>;
}): Promise<void> {
  const updates = await Promise.all(
    args.items.map(({ experimentId, milestoneId, sortOrder }) =>
      client()
        .from("experiments")
        .update({ milestone_id: milestoneId, sort_order: sortOrder, updated_by: args.userId })
        .eq("id", experimentId)
    )
  );
  const failed = updates.find((result) => result.error);
  if (failed?.error) throw failed.error;
}

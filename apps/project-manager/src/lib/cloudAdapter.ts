import { getSupabaseClient } from "@ilm/utils";

export type ProjectStatus = "planning" | "active" | "blocked" | "completed" | "archived";
export type MilestoneStatus = "planned" | "in_progress" | "done" | "cancelled";
export type ExperimentStatus = "planned" | "running" | "completed" | "failed";

export interface ProjectRecord {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  status: string | null;
  approval_required: boolean;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MilestoneRecord {
  id: string;
  lab_id: string;
  project_id: string;
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

export interface ProjectWorkspaceSnapshot {
  projects: ProjectRecord[];
  milestones: MilestoneRecord[];
  experiments: ExperimentRecord[];
  protocols: ProtocolOptionRecord[];
}

const client = () => getSupabaseClient();

const PROJECT_FIELDS =
  "id, lab_id, name, description, status, approval_required, created_by, updated_by, created_at, updated_at";

const MILESTONE_FIELDS =
  "id, lab_id, project_id, title, description, due_date, status, created_by, updated_by, created_at, updated_at";

const EXPERIMENT_FIELDS =
  "id, lab_id, project_id, protocol_id, title, notes, status, started_at, completed_at, created_by, updated_by, created_at, updated_at";

export async function listProjectWorkspace(labId: string): Promise<ProjectWorkspaceSnapshot> {
  const [projectsResult, milestonesResult, experimentsResult, protocolsResult] = await Promise.all([
    client().from("projects").select(PROJECT_FIELDS).eq("lab_id", labId).order("name", { ascending: true }),
    client().from("milestones").select(MILESTONE_FIELDS).eq("lab_id", labId).order("due_date", { ascending: true, nullsFirst: false }),
    client().from("experiments").select(EXPERIMENT_FIELDS).eq("lab_id", labId).order("updated_at", { ascending: false }),
    client().from("protocols").select("id, project_id, title, updated_at").eq("lab_id", labId).order("updated_at", { ascending: false }),
  ]);

  if (projectsResult.error) throw projectsResult.error;
  if (milestonesResult.error) throw milestonesResult.error;
  if (experimentsResult.error) throw experimentsResult.error;
  if (protocolsResult.error) throw protocolsResult.error;

  return {
    projects: (projectsResult.data as ProjectRecord[]) ?? [],
    milestones: (milestonesResult.data as MilestoneRecord[]) ?? [],
    experiments: (experimentsResult.data as ExperimentRecord[]) ?? [],
    protocols: (protocolsResult.data as ProtocolOptionRecord[]) ?? [],
  };
}

export async function createProject(args: {
  labId: string;
  userId: string;
  name: string;
  description?: string;
  status?: string;
  approvalRequired?: boolean;
}): Promise<ProjectRecord> {
  const { data, error } = await client()
    .from("projects")
    .insert({
      lab_id: args.labId,
      name: args.name,
      description: args.description?.trim() || null,
      status: args.status?.trim() || "planning",
      approval_required: args.approvalRequired ?? true,
      created_by: args.userId,
      updated_by: args.userId,
    })
    .select(PROJECT_FIELDS)
    .single();
  if (error) throw error;
  return data as ProjectRecord;
}

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

export async function deleteProject(projectId: string): Promise<void> {
  const { error } = await client().from("projects").delete().eq("id", projectId);
  if (error) throw error;
}

export async function createMilestone(args: {
  labId: string;
  projectId: string;
  userId: string;
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
  title: string;
  description?: string;
  dueDate?: string | null;
  status: MilestoneStatus;
}): Promise<MilestoneRecord> {
  const { data, error } = await client()
    .from("milestones")
    .update({
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

export async function createExperiment(args: {
  labId: string;
  projectId: string;
  userId: string;
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

import type { ProtocolDocument } from "@ilm/types";
import type { SupabaseClient } from "@ilm/utils";
import { safeJsonParse } from "@ilm/utils";
import { normalizeProtocolDocument, validateProtocolDocument } from "@ilm/validation";
import {
  LEGACY_STORAGE_KEY,
  LIBRARY_STORAGE_KEY,
  ensureProtocolMetadata,
  updateProtocolMetadata,
  type ReviewStatus,
} from "./protocolLibrary";

export type ProjectSummary = {
  id: string;
  name: string;
  approvalRequired: boolean;
};

export type PublishedProtocolRecord = {
  id: string;
  projectId: string | null;
  projectName: string;
  document: ProtocolDocument;
  updatedAt: string;
  deletedAt: string | null;
};

export type SubmissionHistoryEntry = {
  type: "submitted" | "approved" | "rejected" | string;
  actor?: string | null;
  at?: string | null;
  comment?: string | null;
};

export type DraftRecord = {
  id: string;
  protocolId: string | null;
  projectId: string | null;
  projectName: string;
  document: ProtocolDocument;
  updatedAt: string;
  submissionHistory: SubmissionHistoryEntry[];
};

export type SubmissionStatus = "pending" | "approved" | "rejected" | "withdrawn";

export type SubmissionRecord = {
  id: string;
  projectId: string;
  projectName: string;
  protocolId: string | null;
  submitterId: string | null;
  submitterLabel: string;
  status: SubmissionStatus;
  reviewComment: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  document: ProtocolDocument;
};

export type CloudWorkspaceSnapshot = {
  projects: ProjectSummary[];
  publishedProtocols: PublishedProtocolRecord[];
  drafts: DraftRecord[];
  submissions: SubmissionRecord[];
  deletedProtocols: PublishedProtocolRecord[];
  leadProjectIds: string[];
  generalProjectId: string | null;
};

type ProjectRow = {
  id: string;
  name: string;
  approval_required: boolean;
};

type ProtocolRow = {
  id: string;
  project_id: string | null;
  updated_at: string;
  deleted_at?: string | null;
  document_json: unknown;
};

type DraftRow = {
  id: string;
  protocol_id: string | null;
  project_id: string | null;
  updated_at: string;
  document_json: unknown;
  submission_history?: unknown;
};

type SubmissionRow = {
  id: string;
  project_id: string;
  protocol_id: string | null;
  submitter_id: string | null;
  status: SubmissionStatus;
  review_comment: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  document_json: unknown;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
};

type LeadRow = {
  project_id: string;
};

const normalizeDocument = (
  value: unknown,
  projectName: string,
  fallbackReviewStatus: ReviewStatus = "reviewing"
): ProtocolDocument | null => {
  const result = validateProtocolDocument(value, { mode: "assisted" });
  if (!result.success || !result.data) return null;

  const normalized = ensureProtocolMetadata(normalizeProtocolDocument(result.data));
  const metadata = normalized.protocol.metadata ?? {};
  const reviewStatus = metadata.reviewStatus === "reviewed" ? "reviewed" : fallbackReviewStatus;

  return updateProtocolMetadata(normalized, {
    project: projectName,
    reviewStatus,
  });
};

const toProjectSummary = (rows: ProjectRow[]): ProjectSummary[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    approvalRequired: row.approval_required,
  }));

const toPublishedProtocolRecord = (
  row: ProtocolRow,
  projectName: string
): PublishedProtocolRecord | null => {
  const document = normalizeDocument(row.document_json, projectName, "reviewed");
  if (!document) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    projectName,
    document,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at ?? null,
  };
};

const toDraftRecord = (row: DraftRow, projectName: string): DraftRecord | null => {
  const document = normalizeDocument(row.document_json, projectName, "reviewing");
  if (!document) return null;

  const historyRaw = Array.isArray(row.submission_history) ? row.submission_history : [];
  const submissionHistory = historyRaw
    .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null)
    .map((entry) => ({
      type: typeof entry.type === "string" ? entry.type : "submitted",
      actor: typeof entry.actor === "string" ? entry.actor : null,
      at: typeof entry.at === "string" ? entry.at : null,
      comment: typeof entry.comment === "string" ? entry.comment : null,
    })) as SubmissionHistoryEntry[];

  return {
    id: row.id,
    protocolId: row.protocol_id,
    projectId: row.project_id,
    projectName,
    document,
    updatedAt: row.updated_at,
    submissionHistory,
  };
};

const toSubmissionRecord = (
  row: SubmissionRow,
  projectName: string,
  submitterLabel: string
): SubmissionRecord | null => {
  const fallbackReviewStatus = row.status === "approved" ? "reviewed" : "reviewing";
  const document = normalizeDocument(row.document_json, projectName, fallbackReviewStatus);
  if (!document) return null;

  return {
    id: row.id,
    projectId: row.project_id,
    projectName,
    protocolId: row.protocol_id,
    submitterId: row.submitter_id,
    submitterLabel,
    status: row.status,
    reviewComment: row.review_comment,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    submittedAt: row.submitted_at,
    document,
  };
};

const profileLabel = (profile: ProfileRow | undefined, fallbackId: string | null) => {
  if (!profile) return fallbackId ?? "Unknown user";
  return profile.display_name || profile.email || fallbackId || "Unknown user";
};

export const loadCloudWorkspaceSnapshot = async (
  supabase: SupabaseClient,
  labId: string,
  userId: string
): Promise<CloudWorkspaceSnapshot> => {
  const [
    projectsResult,
    publishedResult,
    draftsResult,
    submissionsResult,
    deletedResult,
    leadResult,
  ] = await Promise.all([
    supabase.from("projects").select("id, name, approval_required").eq("lab_id", labId).order("name", { ascending: true }),
    supabase.from("protocols").select("id, project_id, updated_at, document_json").eq("lab_id", labId).order("updated_at", { ascending: false }),
    supabase.from("protocol_drafts").select("id, protocol_id, project_id, updated_at, document_json, submission_history").eq("lab_id", labId).order("updated_at", { ascending: false }),
    supabase
      .from("protocol_submissions")
      .select("id, project_id, protocol_id, submitter_id, status, review_comment, reviewed_by, reviewed_at, submitted_at, document_json")
      .eq("lab_id", labId)
      .order("submitted_at", { ascending: false }),
    supabase.rpc("list_deleted_protocols", { p_lab_id: labId }),
    supabase.from("project_leads").select("project_id").eq("user_id", userId),
  ]);

  if (projectsResult.error) throw projectsResult.error;
  if (publishedResult.error) throw publishedResult.error;
  if (draftsResult.error) throw draftsResult.error;
  if (submissionsResult.error) throw submissionsResult.error;
  if (deletedResult.error) throw deletedResult.error;
  if (leadResult.error) throw leadResult.error;

  const projects = toProjectSummary((projectsResult.data as ProjectRow[] | null) ?? []);
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const resolveProjectName = (projectId: string | null) =>
    (projectId ? projectMap.get(projectId)?.name : null) ?? "Unassigned Project";

  const submissionRows = (submissionsResult.data as SubmissionRow[] | null) ?? [];
  const submitterIds = Array.from(
    new Set(submissionRows.map((row) => row.submitter_id).filter((value): value is string => Boolean(value)))
  );

  let profileMap = new Map<string, ProfileRow>();
  if (submitterIds.length > 0) {
    const profilesResult = await supabase.from("profiles").select("id, display_name, email").in("id", submitterIds);
    if (profilesResult.error) throw profilesResult.error;
    profileMap = new Map(((profilesResult.data as ProfileRow[] | null) ?? []).map((profile) => [profile.id, profile]));
  }

  const publishedProtocols = ((publishedResult.data as ProtocolRow[] | null) ?? [])
    .map((row) => toPublishedProtocolRecord(row, resolveProjectName(row.project_id)))
    .filter((row): row is PublishedProtocolRecord => Boolean(row));

  const drafts = ((draftsResult.data as DraftRow[] | null) ?? [])
    .map((row) => toDraftRecord(row, resolveProjectName(row.project_id)))
    .filter((row): row is DraftRecord => Boolean(row));

  const submissions = submissionRows
    .map((row) =>
      toSubmissionRecord(row, resolveProjectName(row.project_id), profileLabel(profileMap.get(row.submitter_id ?? ""), row.submitter_id))
    )
    .filter((row): row is SubmissionRecord => Boolean(row));

  const deletedProtocols = (((deletedResult.data as ProtocolRow[] | null) ?? []) as ProtocolRow[])
    .map((row) => toPublishedProtocolRecord(row, resolveProjectName(row.project_id)))
    .filter((row): row is PublishedProtocolRecord => Boolean(row));

  return {
    projects,
    publishedProtocols,
    drafts,
    submissions,
    deletedProtocols,
    leadProjectIds: (((leadResult.data as LeadRow[] | null) ?? []) as LeadRow[]).map((row) => row.project_id),
    generalProjectId: projects.find((project) => project.name === "General")?.id ?? null,
  };
};

const isLibraryPayload = (
  value: unknown
): value is { activeProtocolId?: string; protocols: unknown[] } =>
  typeof value === "object" &&
  value !== null &&
  Array.isArray((value as { protocols?: unknown[] }).protocols);

export const readLegacyLibraryProtocols = (): ProtocolDocument[] => {
  if (typeof window === "undefined") return [];

  const storedLibrary = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
  if (storedLibrary) {
    const parsed = safeJsonParse<unknown>(storedLibrary);
    if (parsed.ok && isLibraryPayload(parsed.value)) {
      const docs = parsed.value.protocols
        .map((candidate) => normalizeDocument(candidate, "General", "reviewed"))
        .filter((candidate): candidate is ProtocolDocument => Boolean(candidate));
      if (docs.length > 0) return docs;
    }
  }

  const storedLegacyDocument = window.localStorage.getItem(LEGACY_STORAGE_KEY);
  if (storedLegacyDocument) {
    const parsed = safeJsonParse<unknown>(storedLegacyDocument);
    if (parsed.ok) {
      const doc = normalizeDocument(parsed.value, "General", "reviewed");
      if (doc) return [doc];
    }
  }

  return [];
};

export const clearLegacyLibraryStorage = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LIBRARY_STORAGE_KEY);
  window.localStorage.removeItem(LEGACY_STORAGE_KEY);
};

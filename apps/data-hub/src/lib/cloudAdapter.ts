import { getSupabaseClient } from "@ilm/utils";
import { listLabMembers, type LabMemberRecord } from "@ilm/ui";

export const DATASET_TYPES = [
  "sequencing",
  "imaging",
  "flow-cytometry",
  "proteomics",
  "metabolomics",
  "simulation",
  "annotation",
  "clinical",
  "external-reference",
  "other",
] as const;

export const SOURCE_TYPES = [
  "internal-generated",
  "external-public",
  "collaborator-shared",
  "vendor-provided",
  "user-uploaded-metadata",
  "other",
] as const;

export const DATASET_STATUSES = [
  "planned",
  "generating",
  "raw-available",
  "processing",
  "processed",
  "validated",
  "archived",
  "deprecated",
] as const;

export const ACCESS_LEVELS = [
  "open-lab",
  "request-required",
  "restricted",
  "private",
] as const;

export const RELATIONSHIP_TYPES = [
  "generated-by",
  "used-by",
  "derived-from",
  "supports-publication",
  "external-reference",
  "validation",
  "training",
  "benchmark",
] as const;

export const VERSION_TYPES = [
  "raw",
  "processed",
  "analysis-ready",
  "derived",
  "annotation",
  "figure-source",
  "model-input",
  "other",
] as const;

export const REQUEST_ACCESS_TYPES = [
  "view-metadata",
  "view-storage-location",
  "download-or-copy",
  "compute-in-place",
  "reuse-in-project",
  "edit-or-annotate",
] as const;

export type DatasetType = (typeof DATASET_TYPES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type DatasetStatus = (typeof DATASET_STATUSES)[number];
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];
export type VersionType = (typeof VERSION_TYPES)[number];
export type RequestAccessType = (typeof REQUEST_ACCESS_TYPES)[number];
export type RequestStatus = "pending" | "approved" | "denied" | "withdrawn";
export type StorageType = "path" | "url" | "accession" | "doi" | "publication" | "other";

export interface DatasetRecord {
  id: string;
  lab_id: string;
  name: string;
  description: string | null;
  dataset_type: DatasetType;
  source_type: SourceType;
  status: DatasetStatus;
  access_level: AccessLevel;
  owner_user_id: string | null;
  contact_user_id: string | null;
  organism: string | null;
  sample_type: string | null;
  assay_platform: string | null;
  primary_storage_uri: string | null;
  external_accession: string | null;
  citation: string | null;
  license: string | null;
  usage_conditions: string | null;
  recommended_use: string | null;
  not_recommended_use: string | null;
  qc_summary: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface DatasetVersionRecord {
  id: string;
  lab_id: string;
  dataset_id: string;
  version_name: string;
  version_type: VersionType;
  description: string | null;
  storage_uri: string | null;
  parent_version_id: string | null;
  processing_summary: string | null;
  software_environment: string | null;
  qc_summary: string | null;
  file_summary: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetProjectLinkRecord {
  id: string;
  lab_id: string;
  dataset_id: string;
  project_id: string;
  relationship_type: RelationshipType;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DatasetAccessRequestRecord {
  id: string;
  lab_id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  requester_user_id: string | null;
  project_id: string | null;
  intended_use: string;
  requested_access_type: RequestAccessType;
  status: RequestStatus;
  reviewer_user_id: string | null;
  decision_note: string | null;
  conditions: string | null;
  created_at: string;
  reviewed_at: string | null;
  withdrawn_at: string | null;
}

export interface DatasetTagRecord {
  id: string;
  lab_id: string;
  dataset_id: string;
  tag: string;
  created_at: string;
}

export interface DatasetStorageLinkRecord {
  id: string;
  lab_id: string;
  dataset_id: string;
  dataset_version_id: string | null;
  label: string | null;
  storage_uri: string;
  storage_type: StorageType;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DatasetAccessGrantRecord {
  id: string;
  lab_id: string;
  dataset_id: string;
  user_id: string;
  granted_by: string | null;
  granted_at: string;
  note: string | null;
}

export interface ProjectOptionRecord {
  id: string;
  name: string;
}

export interface DataHubWorkspaceSnapshot {
  datasets: DatasetRecord[];
  versions: DatasetVersionRecord[];
  projectLinks: DatasetProjectLinkRecord[];
  requests: DatasetAccessRequestRecord[];
  tags: DatasetTagRecord[];
  storageLinks: DatasetStorageLinkRecord[];
  accessGrants: DatasetAccessGrantRecord[];
  projects: ProjectOptionRecord[];
  labMembers: LabMemberRecord[];
}

export interface DatasetInput {
  name: string;
  description?: string | null;
  dataset_type?: DatasetType;
  source_type?: SourceType;
  status?: DatasetStatus;
  access_level?: AccessLevel;
  owner_user_id?: string | null;
  contact_user_id?: string | null;
  organism?: string | null;
  sample_type?: string | null;
  assay_platform?: string | null;
  external_accession?: string | null;
  citation?: string | null;
  license?: string | null;
  usage_conditions?: string | null;
  recommended_use?: string | null;
  not_recommended_use?: string | null;
  qc_summary?: string | null;
  notes?: string | null;
}

export interface VersionInput {
  version_name: string;
  version_type?: VersionType;
  description?: string | null;
  parent_version_id?: string | null;
  processing_summary?: string | null;
  software_environment?: string | null;
  qc_summary?: string | null;
  file_summary?: string | null;
  notes?: string | null;
}

export interface ProjectLinkInput {
  project_id: string;
  relationship_type: RelationshipType;
  note?: string | null;
}

const client = () => getSupabaseClient();

const DATASET_FIELDS =
  "id, lab_id, name, description, dataset_type, source_type, status, access_level, owner_user_id, contact_user_id, organism, sample_type, assay_platform, primary_storage_uri, external_accession, citation, license, usage_conditions, recommended_use, not_recommended_use, qc_summary, notes, created_by, updated_by, created_at, updated_at, archived_at";
const VERSION_FIELDS =
  "id, lab_id, dataset_id, version_name, version_type, description, storage_uri, parent_version_id, processing_summary, software_environment, qc_summary, file_summary, notes, created_by, updated_by, created_at, updated_at";
const PROJECT_LINK_FIELDS =
  "id, lab_id, dataset_id, project_id, relationship_type, note, created_by, created_at";
const REQUEST_FIELDS =
  "id, lab_id, dataset_id, dataset_version_id, requester_user_id, project_id, intended_use, requested_access_type, status, reviewer_user_id, decision_note, conditions, created_at, reviewed_at, withdrawn_at";
const TAG_FIELDS = "id, lab_id, dataset_id, tag, created_at";
const STORAGE_FIELDS =
  "id, lab_id, dataset_id, dataset_version_id, label, storage_uri, storage_type, notes, created_by, created_at";
const GRANT_FIELDS =
  "id, lab_id, dataset_id, user_id, granted_by, granted_at, note";

const normalizeTags = (tags: string[]) =>
  Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean))).slice(0, 24);

export async function listDataHubWorkspace(labId: string): Promise<DataHubWorkspaceSnapshot> {
  const [
    datasetsResult,
    versionsResult,
    projectLinksResult,
    requestsResult,
    tagsResult,
    storageLinksResult,
    accessGrantsResult,
    projectsResult,
    members,
  ] = await Promise.all([
    client().from("datasets").select(DATASET_FIELDS).eq("lab_id", labId).order("updated_at", { ascending: false }),
    client().from("dataset_versions").select(VERSION_FIELDS).eq("lab_id", labId).order("created_at", { ascending: false }),
    client().from("dataset_project_links").select(PROJECT_LINK_FIELDS).eq("lab_id", labId),
    client().from("dataset_access_requests").select(REQUEST_FIELDS).eq("lab_id", labId).order("created_at", { ascending: false }),
    client().from("dataset_tags").select(TAG_FIELDS).eq("lab_id", labId).order("tag", { ascending: true }),
    client().from("dataset_storage_links").select(STORAGE_FIELDS).eq("lab_id", labId).order("created_at", { ascending: true }),
    client().from("dataset_access_grants").select(GRANT_FIELDS).eq("lab_id", labId).order("granted_at", { ascending: true }),
    client().from("projects").select("id, name").eq("lab_id", labId).order("name", { ascending: true }),
    listLabMembers(labId).catch(() => [] as LabMemberRecord[]),
  ]);

  if (datasetsResult.error) throw datasetsResult.error;
  if (versionsResult.error) throw versionsResult.error;
  if (projectLinksResult.error) throw projectLinksResult.error;
  if (requestsResult.error) throw requestsResult.error;
  if (tagsResult.error) throw tagsResult.error;
  if (storageLinksResult.error) throw storageLinksResult.error;
  if (accessGrantsResult.error) throw accessGrantsResult.error;
  if (projectsResult.error) throw projectsResult.error;

  return {
    datasets: (datasetsResult.data as DatasetRecord[]) ?? [],
    versions: (versionsResult.data as DatasetVersionRecord[]) ?? [],
    projectLinks: (projectLinksResult.data as DatasetProjectLinkRecord[]) ?? [],
    requests: (requestsResult.data as DatasetAccessRequestRecord[]) ?? [],
    tags: (tagsResult.data as DatasetTagRecord[]) ?? [],
    storageLinks: (storageLinksResult.data as DatasetStorageLinkRecord[]) ?? [],
    accessGrants: (accessGrantsResult.data as DatasetAccessGrantRecord[]) ?? [],
    projects: (projectsResult.data as ProjectOptionRecord[]) ?? [],
    labMembers: members,
  };
}

export async function createDataset(args: {
  labId: string;
  userId: string;
  data: DatasetInput;
  tags?: string[];
  projectLinks?: ProjectLinkInput[];
  storageUri?: string | null;
}): Promise<DatasetRecord> {
  const { data, error } = await client()
    .rpc("create_dataset", {
      p_lab_id: args.labId,
      p_name: args.data.name,
      p_description: args.data.description ?? null,
      p_dataset_type: args.data.dataset_type ?? "other",
      p_source_type: args.data.source_type ?? "internal-generated",
      p_status: args.data.status ?? "planned",
      p_access_level: args.data.access_level ?? "request-required",
      p_owner_user_id:
        args.data.owner_user_id === undefined ? args.userId : args.data.owner_user_id,
      p_contact_user_id:
        args.data.contact_user_id === undefined
          ? args.data.owner_user_id === undefined
            ? args.userId
            : args.data.owner_user_id
          : args.data.contact_user_id,
      p_organism: args.data.organism ?? null,
      p_sample_type: args.data.sample_type ?? null,
      p_assay_platform: args.data.assay_platform ?? null,
      p_external_accession: args.data.external_accession ?? null,
      p_citation: args.data.citation ?? null,
      p_license: args.data.license ?? null,
      p_usage_conditions: args.data.usage_conditions ?? null,
      p_recommended_use: args.data.recommended_use ?? null,
      p_not_recommended_use: args.data.not_recommended_use ?? null,
      p_qc_summary: args.data.qc_summary ?? null,
      p_notes: args.data.notes ?? null,
      p_tags: normalizeTags(args.tags ?? []),
      p_project_links: args.projectLinks ?? [],
      p_storage_uri: args.storageUri ?? null,
    })
    .single();
  if (error) throw error;
  return data as DatasetRecord;
}

export async function updateDataset(args: {
  datasetId: string;
  labId: string;
  userId: string;
  data: DatasetInput;
  tags?: string[];
  projectLinks?: ProjectLinkInput[];
  storageUri?: string | null;
}): Promise<DatasetRecord> {
  const { data, error } = await client()
    .rpc("update_dataset", {
      p_dataset_id: args.datasetId,
      p_name: args.data.name,
      p_description: args.data.description ?? null,
      p_dataset_type: args.data.dataset_type ?? "other",
      p_source_type: args.data.source_type ?? "internal-generated",
      p_status: args.data.status ?? "planned",
      p_access_level: args.data.access_level ?? "request-required",
      p_owner_user_id: args.data.owner_user_id ?? null,
      p_contact_user_id: args.data.contact_user_id ?? null,
      p_organism: args.data.organism ?? null,
      p_sample_type: args.data.sample_type ?? null,
      p_assay_platform: args.data.assay_platform ?? null,
      p_external_accession: args.data.external_accession ?? null,
      p_citation: args.data.citation ?? null,
      p_license: args.data.license ?? null,
      p_usage_conditions: args.data.usage_conditions ?? null,
      p_recommended_use: args.data.recommended_use ?? null,
      p_not_recommended_use: args.data.not_recommended_use ?? null,
      p_qc_summary: args.data.qc_summary ?? null,
      p_notes: args.data.notes ?? null,
      p_tags: normalizeTags(args.tags ?? []),
      p_project_links: args.projectLinks ?? [],
      p_storage_uri: args.storageUri ?? null,
    })
    .single();
  if (error) throw error;
  return data as DatasetRecord;
}

export async function archiveDataset(datasetId: string): Promise<DatasetRecord> {
  const { data, error } = await client()
    .rpc("archive_dataset", { p_dataset_id: datasetId })
    .single();
  if (error) throw error;
  return data as DatasetRecord;
}

export async function restoreDataset(datasetId: string): Promise<DatasetRecord> {
  const { data, error } = await client()
    .rpc("restore_dataset", { p_dataset_id: datasetId })
    .single();
  if (error) throw error;
  return data as DatasetRecord;
}

export async function deleteDataset(datasetId: string): Promise<void> {
  const { error } = await client().rpc("delete_dataset", { p_dataset_id: datasetId });
  if (error) throw error;
}

export async function deleteDatasetVersion(versionId: string): Promise<void> {
  const { error } = await client().rpc("delete_dataset_version", { p_version_id: versionId });
  if (error) throw error;
}

export async function grantDatasetAccess(args: {
  datasetId: string;
  userId: string;
  note?: string | null;
}): Promise<DatasetAccessGrantRecord> {
  const { data, error } = await client()
    .rpc("grant_dataset_access", {
      p_dataset_id: args.datasetId,
      p_user_id: args.userId,
      p_note: args.note ?? null,
    })
    .single();
  if (error) throw error;
  return data as DatasetAccessGrantRecord;
}

export async function revokeDatasetAccess(grantId: string): Promise<void> {
  const { error } = await client().rpc("revoke_dataset_access", { p_grant_id: grantId });
  if (error) throw error;
}

export async function createDatasetVersion(args: {
  labId: string;
  userId: string;
  datasetId: string;
  data: VersionInput;
  storageUri?: string | null;
}): Promise<DatasetVersionRecord> {
  const { data, error } = await client()
    .rpc("create_dataset_version", {
      p_dataset_id: args.datasetId,
      p_version_name: args.data.version_name,
      p_version_type: args.data.version_type ?? "processed",
      p_description: args.data.description ?? null,
      p_parent_version_id: args.data.parent_version_id ?? null,
      p_processing_summary: args.data.processing_summary ?? null,
      p_software_environment: args.data.software_environment ?? null,
      p_qc_summary: args.data.qc_summary ?? null,
      p_file_summary: args.data.file_summary ?? null,
      p_notes: args.data.notes ?? null,
      p_storage_uri: args.storageUri ?? null,
    })
    .single();
  if (error) throw error;
  return data as DatasetVersionRecord;
}

export async function createDatasetAccessRequest(args: {
  labId: string;
  userId: string;
  datasetId: string;
  datasetVersionId?: string | null;
  projectId?: string | null;
  intendedUse: string;
  requestedAccessType: RequestAccessType;
}): Promise<DatasetAccessRequestRecord> {
  const { data, error } = await client()
    .rpc("submit_dataset_access_request", {
      p_dataset_id: args.datasetId,
      p_dataset_version_id: args.datasetVersionId ?? null,
      p_project_id: args.projectId ?? null,
      p_intended_use: args.intendedUse,
      p_requested_access_type: args.requestedAccessType,
    })
    .single();
  if (error) throw error;
  return data as DatasetAccessRequestRecord;
}

export async function recordDatasetUse(args: {
  labId: string;
  userId: string;
  datasetId: string;
  datasetVersionId?: string | null;
  projectId?: string | null;
  intendedUse: string;
  requestedAccessType: RequestAccessType;
}): Promise<DatasetAccessRequestRecord> {
  const { data, error } = await client()
    .rpc("record_dataset_use", {
      p_dataset_id: args.datasetId,
      p_dataset_version_id: args.datasetVersionId ?? null,
      p_project_id: args.projectId ?? null,
      p_intended_use: args.intendedUse,
      p_requested_access_type: args.requestedAccessType,
    })
    .single();
  if (error) throw error;
  return data as DatasetAccessRequestRecord;
}

export async function withdrawDatasetAccessRequest(
  requestId: string
): Promise<DatasetAccessRequestRecord> {
  const { data, error } = await client()
    .rpc("withdraw_dataset_access_request", { p_request_id: requestId })
    .single();
  if (error) throw error;
  return data as DatasetAccessRequestRecord;
}

export async function reviewDatasetAccessRequest(args: {
  requestId: string;
  status: "approved" | "denied";
  decisionNote?: string | null;
  conditions?: string | null;
  createProjectLink?: boolean;
}): Promise<DatasetAccessRequestRecord> {
  const { data, error } = await client()
    .rpc("review_dataset_access_request", {
      p_request_id: args.requestId,
      p_status: args.status,
      p_decision_note: args.decisionNote ?? null,
      p_conditions: args.conditions ?? null,
      p_create_project_link: args.createProjectLink ?? true,
    })
    .single();
  if (error) throw error;
  return data as DatasetAccessRequestRecord;
}


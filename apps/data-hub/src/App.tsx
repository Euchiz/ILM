import { useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  EmptyState,
  ErrorBanner,
  FormField,
  FormRow,
  InlineError,
  InlineNote,
  Input,
  LabShell,
  LabTopbar,
  Modal,
  Panel,
  SectionHeader,
  Select,
  StatusPill,
  Table,
  TableEmpty,
  TableLoading,
  Textarea,
  useAuth,
  type BadgeTone,
  type LabMemberRecord,
  type StatusTone,
} from "@ilm/ui";
import { useDataHubWorkspace } from "./lib/useDataHubWorkspace";
import {
  ACCESS_LEVELS,
  DATASET_STATUSES,
  DATASET_TYPES,
  REQUEST_ACCESS_TYPES,
  SOURCE_TYPES,
  VERSION_TYPES,
  type AccessLevel,
  type DatasetAccessRequestRecord,
  type DatasetInput,
  type DatasetRecord,
  type DatasetStatus,
  type DatasetStorageLinkRecord,
  type DatasetVersionRecord,
  type ProjectLinkInput,
  type ProjectOptionRecord,
  type RequestAccessType,
  type SourceType,
  type VersionInput,
} from "./lib/cloudAdapter";

const APP_BASE_URL = import.meta.env.BASE_URL;

type DataHubTab = "library" | "my-datasets" | "requests";
type ModalState =
  | { kind: "none" }
  | { kind: "dataset"; dataset: DatasetRecord | null }
  | { kind: "version"; datasetId: string }
  | { kind: "request"; datasetId: string }
  | { kind: "review"; request: DatasetAccessRequestRecord; decision: "approved" | "denied" };

type FilterState = {
  search: string;
  datasetType: "all" | string;
  sourceType: "all" | string;
  status: "all" | string;
  accessLevel: "all" | string;
  projectId: "all" | string;
  tag: "all" | string;
  ownerId: "all" | string;
  showArchived: boolean;
};

const EMPTY_FILTERS: FilterState = {
  search: "",
  datasetType: "all",
  sourceType: "all",
  status: "all",
  accessLevel: "all",
  projectId: "all",
  tag: "all",
  ownerId: "all",
  showArchived: false,
};

const labelize = (value: string) =>
  value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return "Unexpected error";
};

const formatDate = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

const memberLabel = (member: LabMemberRecord | null | undefined, fallback?: string | null) =>
  member?.display_name?.trim() || member?.email?.trim() || fallback || "-";

const datasetStatusTone = (status: DatasetStatus): StatusTone => {
  if (status === "planned") return "proposed";
  if (status === "generating" || status === "processing") return "reviewing";
  if (status === "raw-available") return "submitted";
  if (status === "processed") return "active";
  if (status === "validated") return "validated";
  if (status === "archived") return "archived";
  if (status === "deprecated") return "cancelled";
  return "neutral";
};

const accessTone = (level: AccessLevel): BadgeTone => {
  if (level === "open-lab") return "success";
  if (level === "request-required") return "info";
  if (level === "restricted") return "warning";
  return "danger";
};

const requestTone = (status: DatasetAccessRequestRecord["status"]): BadgeTone => {
  if (status === "approved") return "success";
  if (status === "denied") return "danger";
  if (status === "withdrawn") return "neutral";
  return "warning";
};

const getRequestAction = (
  dataset: DatasetRecord,
  requests: DatasetAccessRequestRecord[],
  currentUserId: string | null
) => {
  if (!currentUserId) return null;
  if (dataset.archived_at) return { label: "Archived", disabled: true };
  const mine = requests.filter((request) => request.requester_user_id === currentUserId);
  if (mine.some((request) => request.status === "pending")) {
    return { label: "Pending", disabled: true };
  }
  if (mine.some((request) => request.status === "approved")) {
    return { label: dataset.access_level === "open-lab" ? "Reuse recorded" : "Approved", disabled: true };
  }
  return {
    label: dataset.access_level === "open-lab" ? "Record reuse" : "Request access",
    disabled: false,
  };
};

const splitTags = (value: string) =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const App = () => {
  const { user, activeLab } = useAuth();
  const isAdmin = activeLab?.role === "owner" || activeLab?.role === "admin";
  const workspace = useDataHubWorkspace({
    labId: activeLab?.id ?? null,
    userId: user?.id ?? null,
  });

  const [tab, setTab] = useState<DataHubTab>(() => {
    const hash = typeof window === "undefined" ? "" : window.location.hash.replace(/^#\/?/, "");
    if (hash === "my-datasets" || hash === "requests") return hash;
    return "library";
  });
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [actionError, setActionError] = useState<string | null>(null);

  const membersById = useMemo(() => {
    const map = new Map<string, LabMemberRecord>();
    for (const member of workspace.labMembers) map.set(member.user_id, member);
    return map;
  }, [workspace.labMembers]);

  const projectsById = useMemo(() => {
    const map = new Map<string, ProjectOptionRecord>();
    for (const project of workspace.projects) map.set(project.id, project);
    return map;
  }, [workspace.projects]);

  const tagsByDatasetId = useMemo(() => groupBy(workspace.tags, "dataset_id"), [workspace.tags]);
  const linksByDatasetId = useMemo(() => groupBy(workspace.projectLinks, "dataset_id"), [workspace.projectLinks]);
  const versionsByDatasetId = useMemo(() => groupBy(workspace.versions, "dataset_id"), [workspace.versions]);
  const requestsByDatasetId = useMemo(() => groupBy(workspace.requests, "dataset_id"), [workspace.requests]);
  const storageByDatasetId = useMemo(() => groupBy(workspace.storageLinks, "dataset_id"), [workspace.storageLinks]);

  const allTags = useMemo(
    () => Array.from(new Set(workspace.tags.map((tag) => tag.tag))).sort((a, b) => a.localeCompare(b)),
    [workspace.tags]
  );

  const filteredDatasets = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return workspace.datasets.filter((dataset) => {
      if (!filters.showArchived && dataset.archived_at) return false;
      if (filters.datasetType !== "all" && dataset.dataset_type !== filters.datasetType) return false;
      if (filters.sourceType !== "all" && dataset.source_type !== filters.sourceType) return false;
      if (filters.status !== "all" && dataset.status !== filters.status) return false;
      if (filters.accessLevel !== "all" && dataset.access_level !== filters.accessLevel) return false;
      if (filters.ownerId !== "all" && dataset.owner_user_id !== filters.ownerId) return false;
      const tags = tagsByDatasetId.get(dataset.id) ?? [];
      if (filters.tag !== "all" && !tags.some((tag) => tag.tag === filters.tag)) return false;
      const links = linksByDatasetId.get(dataset.id) ?? [];
      if (filters.projectId !== "all" && !links.some((link) => link.project_id === filters.projectId)) return false;
      if (!q) return true;
      const projectNames = links.map((link) => projectsById.get(link.project_id)?.name ?? "").join(" ");
      const owner = memberLabel(membersById.get(dataset.owner_user_id ?? ""), dataset.owner_user_id);
      const haystack = [
        dataset.name,
        dataset.description ?? "",
        dataset.dataset_type,
        dataset.source_type,
        dataset.organism ?? "",
        dataset.sample_type ?? "",
        dataset.assay_platform ?? "",
        dataset.external_accession ?? "",
        dataset.citation ?? "",
        owner,
        projectNames,
        tags.map((tag) => tag.tag).join(" "),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [filters, linksByDatasetId, membersById, projectsById, tagsByDatasetId, workspace.datasets]);

  const selectedDataset = selectedDatasetId
    ? workspace.datasets.find((dataset) => dataset.id === selectedDatasetId) ?? null
    : null;

  const canEditDataset = (dataset: DatasetRecord) =>
    isAdmin ||
    dataset.owner_user_id === user?.id ||
    dataset.contact_user_id === user?.id ||
    dataset.created_by === user?.id;

  const wrap = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setActionError(null);
    try {
      return await fn();
    } catch (err) {
      setActionError(errorMessage(err));
      return null;
    }
  };

  const showDataset = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    if (typeof window !== "undefined") window.location.hash = `dataset/${datasetId}`;
  };

  const setActiveTab = (next: DataHubTab) => {
    setSelectedDatasetId(null);
    setTab(next);
    if (typeof window !== "undefined") window.location.hash = next === "library" ? "" : next;
  };

  const closeModal = () => setModal({ kind: "none" });

  const renderMain = () => {
    if (selectedDataset) {
      return (
        <DatasetDetailView
          dataset={selectedDataset}
          canEdit={canEditDataset(selectedDataset)}
          currentUserId={user?.id ?? null}
          isAdmin={isAdmin}
          membersById={membersById}
          projectsById={projectsById}
          tags={tagsByDatasetId.get(selectedDataset.id) ?? []}
          projectLinks={linksByDatasetId.get(selectedDataset.id) ?? []}
          versions={versionsByDatasetId.get(selectedDataset.id) ?? []}
          requests={requestsByDatasetId.get(selectedDataset.id) ?? []}
          storageLinks={storageByDatasetId.get(selectedDataset.id) ?? []}
          onBack={() => setSelectedDatasetId(null)}
          onEdit={() => setModal({ kind: "dataset", dataset: selectedDataset })}
          onArchive={() => wrap(() => workspace.archiveDataset(selectedDataset.id))}
          onRestore={() => wrap(() => workspace.restoreDataset(selectedDataset.id))}
          onAddVersion={() => setModal({ kind: "version", datasetId: selectedDataset.id })}
          onRequestAccess={() => setModal({ kind: "request", datasetId: selectedDataset.id })}
          onReview={(request, decision) => setModal({ kind: "review", request, decision })}
          onWithdraw={(requestId) => wrap(() => workspace.withdrawDatasetAccessRequest(requestId))}
        />
      );
    }

    if (tab === "my-datasets") {
      return (
        <MyDatasetsView
          datasets={workspace.datasets}
          currentUserId={user?.id ?? null}
          membersById={membersById}
          projectsById={projectsById}
          tagsByDatasetId={tagsByDatasetId}
          linksByDatasetId={linksByDatasetId}
          requests={workspace.requests}
          onOpen={showDataset}
          onCreate={() => setModal({ kind: "dataset", dataset: null })}
        />
      );
    }

    if (tab === "requests") {
      return (
        <RequestsDashboard
          requests={workspace.requests}
          datasets={workspace.datasets}
          projectsById={projectsById}
          membersById={membersById}
          currentUserId={user?.id ?? null}
          isAdmin={isAdmin}
          onOpenDataset={showDataset}
          onReview={(request, decision) => setModal({ kind: "review", request, decision })}
          onWithdraw={(requestId) => wrap(() => workspace.withdrawDatasetAccessRequest(requestId))}
        />
      );
    }

    return (
      <DatasetLibraryView
        status={workspace.status}
        datasets={filteredDatasets}
        totalCount={workspace.datasets.length}
        filters={filters}
        allTags={allTags}
        projects={workspace.projects}
        labMembers={workspace.labMembers}
        membersById={membersById}
        projectsById={projectsById}
        tagsByDatasetId={tagsByDatasetId}
        linksByDatasetId={linksByDatasetId}
        requestsByDatasetId={requestsByDatasetId}
        currentUserId={user?.id ?? null}
        onChangeFilters={setFilters}
        onOpen={showDataset}
        onEdit={(dataset) => setModal({ kind: "dataset", dataset })}
        onRequestAccess={(dataset) => setModal({ kind: "request", datasetId: dataset.id })}
        canEditDataset={canEditDataset}
      />
    );
  };

  return (
    <LabShell
      activeNavId="data"
      baseUrl={APP_BASE_URL}
      topbar={
        <LabTopbar
          kicker="DATA HUB"
          title="Data Hub"
          subtitle="Find, register, request, and reuse lab datasets without storing raw files in ILM."
        />
      }
      subbar={
        <nav className="dh-subbar" aria-label="Data Hub sections">
          {[
            ["library", "Library"],
            ["my-datasets", "My Datasets"],
            ["requests", "Requests"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={tab === id && !selectedDataset ? "dh-subtab is-active" : "dh-subtab"}
              onClick={() => setActiveTab(id as DataHubTab)}
              aria-current={tab === id && !selectedDataset ? "page" : undefined}
            >
              {label}
            </button>
          ))}
          <span className="dh-subbar-spacer" />
          <Button variant="primary" onClick={() => setModal({ kind: "dataset", dataset: null })}>
            + New dataset
          </Button>
        </nav>
      }
    >
      {workspace.error ? <ErrorBanner>{workspace.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}
      {renderMain()}

      {modal.kind === "dataset" ? (
        <DatasetFormModal
          dataset={modal.dataset}
          projects={workspace.projects}
          labMembers={workspace.labMembers}
          tags={modal.dataset ? tagsByDatasetId.get(modal.dataset.id) ?? [] : []}
          projectLinks={modal.dataset ? linksByDatasetId.get(modal.dataset.id) ?? [] : []}
          storageLinks={modal.dataset ? storageByDatasetId.get(modal.dataset.id) ?? [] : []}
          currentUserId={user?.id ?? null}
          onClose={closeModal}
          onSubmit={async (payload) => {
            const saved = await wrap(() =>
              modal.dataset
                ? workspace.updateDataset({ datasetId: modal.dataset.id, ...payload })
                : workspace.createDataset(payload)
            );
            if (saved) {
              closeModal();
              showDataset(saved.id);
            }
          }}
        />
      ) : null}

      {modal.kind === "version" ? (
        <VersionFormModal
          datasetId={modal.datasetId}
          versions={versionsByDatasetId.get(modal.datasetId) ?? []}
          onClose={closeModal}
          onSubmit={async (payload) => {
            const saved = await wrap(() => workspace.createDatasetVersion(payload));
            if (saved) closeModal();
          }}
        />
      ) : null}

      {modal.kind === "request" ? (
        <AccessRequestModal
          dataset={workspace.datasets.find((dataset) => dataset.id === modal.datasetId) ?? null}
          projects={workspace.projects}
          versions={versionsByDatasetId.get(modal.datasetId) ?? []}
          onClose={closeModal}
          onSubmit={async (payload) => {
            const saved = await wrap(() => workspace.createDatasetAccessRequest(payload));
            if (saved) closeModal();
          }}
        />
      ) : null}

      {modal.kind === "review" ? (
        <ReviewRequestModal
          request={modal.request}
          decision={modal.decision}
          onClose={closeModal}
          onSubmit={async (payload) => {
            const saved = await wrap(() => workspace.reviewDatasetAccessRequest(payload));
            if (saved) closeModal();
          }}
        />
      ) : null}
    </LabShell>
  );
};

function DatasetLibraryView({
  status,
  datasets,
  totalCount,
  filters,
  allTags,
  projects,
  labMembers,
  membersById,
  projectsById,
  tagsByDatasetId,
  linksByDatasetId,
  requestsByDatasetId,
  currentUserId,
  onChangeFilters,
  onOpen,
  onEdit,
  onRequestAccess,
  canEditDataset,
}: {
  status: string;
  datasets: DatasetRecord[];
  totalCount: number;
  filters: FilterState;
  allTags: string[];
  projects: ProjectOptionRecord[];
  labMembers: LabMemberRecord[];
  membersById: Map<string, LabMemberRecord>;
  projectsById: Map<string, ProjectOptionRecord>;
  tagsByDatasetId: Map<string, { tag: string }[]>;
  linksByDatasetId: Map<string, { project_id: string }[]>;
  requestsByDatasetId: Map<string, DatasetAccessRequestRecord[]>;
  currentUserId: string | null;
  onChangeFilters: (filters: FilterState) => void;
  onOpen: (datasetId: string) => void;
  onEdit: (dataset: DatasetRecord) => void;
  onRequestAccess: (dataset: DatasetRecord) => void;
  canEditDataset: (dataset: DatasetRecord) => boolean;
}) {
  const patchFilters = (patch: Partial<FilterState>) => onChangeFilters({ ...filters, ...patch });
  return (
    <Panel>
      <SectionHeader title="Dataset library" meta={`${datasets.length} of ${totalCount}`} />
      <InlineNote>
        ILM stores dataset metadata and storage references only. Raw files stay in their existing lab, cloud, archive, or external locations.
      </InlineNote>
      <div className="dh-filter-grid">
        <FormField label="Search">
          <Input
            value={filters.search}
            onChange={(event) => patchFilters({ search: event.target.value })}
            placeholder="Name, tag, assay, owner, project, accession"
          />
        </FormField>
        <FormField label="Type">
          <Select value={filters.datasetType} onChange={(event) => patchFilters({ datasetType: event.target.value })}>
            <option value="all">All</option>
            {DATASET_TYPES.map((type) => (
              <option key={type} value={type}>{labelize(type)}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Source">
          <Select value={filters.sourceType} onChange={(event) => patchFilters({ sourceType: event.target.value })}>
            <option value="all">All</option>
            {SOURCE_TYPES.map((type) => (
              <option key={type} value={type}>{labelize(type)}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status">
          <Select value={filters.status} onChange={(event) => patchFilters({ status: event.target.value })}>
            <option value="all">All</option>
            {DATASET_STATUSES.map((datasetStatus) => (
              <option key={datasetStatus} value={datasetStatus}>{labelize(datasetStatus)}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Access">
          <Select value={filters.accessLevel} onChange={(event) => patchFilters({ accessLevel: event.target.value })}>
            <option value="all">All</option>
            {ACCESS_LEVELS.map((level) => (
              <option key={level} value={level}>{labelize(level)}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Owner">
          <Select value={filters.ownerId} onChange={(event) => patchFilters({ ownerId: event.target.value })}>
            <option value="all">All</option>
            {labMembers.map((member) => (
              <option key={member.user_id} value={member.user_id}>{memberLabel(member)}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Project">
          <Select value={filters.projectId} onChange={(event) => patchFilters({ projectId: event.target.value })}>
            <option value="all">All</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Tag">
          <Select value={filters.tag} onChange={(event) => patchFilters({ tag: event.target.value })}>
            <option value="all">All</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>{tag}</option>
            ))}
          </Select>
        </FormField>
        <label className="dh-checkbox">
          <input
            type="checkbox"
            checked={filters.showArchived}
            onChange={(event) => patchFilters({ showArchived: event.target.checked })}
          />
          Show archived
        </label>
      </div>
      <DatasetTable
        status={status}
        datasets={datasets}
        membersById={membersById}
        projectsById={projectsById}
        tagsByDatasetId={tagsByDatasetId}
        linksByDatasetId={linksByDatasetId}
        requestsByDatasetId={requestsByDatasetId}
        currentUserId={currentUserId}
        onOpen={onOpen}
        onEdit={onEdit}
        onRequestAccess={onRequestAccess}
        canEditDataset={canEditDataset}
      />
    </Panel>
  );
}

function DatasetTable({
  status,
  datasets,
  membersById,
  projectsById,
  tagsByDatasetId,
  linksByDatasetId,
  requestsByDatasetId,
  currentUserId,
  onOpen,
  onEdit,
  onRequestAccess,
  canEditDataset,
}: {
  status: string;
  datasets: DatasetRecord[];
  membersById: Map<string, LabMemberRecord>;
  projectsById: Map<string, ProjectOptionRecord>;
  tagsByDatasetId: Map<string, { tag: string }[]>;
  linksByDatasetId: Map<string, { project_id: string }[]>;
  requestsByDatasetId: Map<string, DatasetAccessRequestRecord[]>;
  currentUserId: string | null;
  onOpen: (datasetId: string) => void;
  onEdit: (dataset: DatasetRecord) => void;
  onRequestAccess: (dataset: DatasetRecord) => void;
  canEditDataset: (dataset: DatasetRecord) => boolean;
}) {
  return (
    <div className="dh-table-scroll">
      <Table>
        <thead>
          <tr>
            <th>Dataset</th>
            <th>Type / source</th>
            <th>Owner</th>
            <th>Projects</th>
            <th>Status</th>
            <th>Access</th>
            <th>Tags</th>
            <th>Updated</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {status === "loading" ? (
            <TableLoading colSpan={9} />
          ) : datasets.length === 0 ? (
            <TableEmpty colSpan={9}>No datasets match the current view.</TableEmpty>
          ) : (
            datasets.map((dataset) => {
              const owner = membersById.get(dataset.owner_user_id ?? "");
              const projectLinks = linksByDatasetId.get(dataset.id) ?? [];
              const tags = tagsByDatasetId.get(dataset.id) ?? [];
              const requests = requestsByDatasetId.get(dataset.id) ?? [];
              const requestAction = getRequestAction(dataset, requests, currentUserId);
              return (
                <tr key={dataset.id}>
                  <td>
                    <button type="button" className="dh-link-button" onClick={() => onOpen(dataset.id)}>
                      {dataset.name}
                    </button>
                    <div className="dh-cell-meta">{dataset.description ?? "No description yet."}</div>
                  </td>
                  <td>
                    <div>{labelize(dataset.dataset_type)}</div>
                    <div className="dh-cell-meta">{labelize(dataset.source_type)}</div>
                  </td>
                  <td>{memberLabel(owner, dataset.owner_user_id)}</td>
                  <td>
                    <CompactProjectList links={projectLinks} projectsById={projectsById} />
                  </td>
                  <td><StatusPill status={datasetStatusTone(dataset.status)}>{labelize(dataset.status)}</StatusPill></td>
                  <td><Badge tone={accessTone(dataset.access_level)}>{labelize(dataset.access_level)}</Badge></td>
                  <td><TagList tags={tags.map((tag) => tag.tag)} compact /></td>
                  <td>{formatDate(dataset.updated_at)}</td>
                  <td className="dh-actions-cell">
                    <Button size="sm" variant="secondary" onClick={() => onOpen(dataset.id)}>View</Button>
                    {canEditDataset(dataset) ? (
                      <Button size="sm" variant="ghost" onClick={() => onEdit(dataset)}>Edit</Button>
                    ) : null}
                    {requestAction ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={requestAction.disabled}
                        onClick={() => {
                          if (!requestAction.disabled) onRequestAccess(dataset);
                        }}
                      >
                        {requestAction.label}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </div>
  );
}

function MyDatasetsView({
  datasets,
  currentUserId,
  membersById,
  projectsById,
  tagsByDatasetId,
  linksByDatasetId,
  requests,
  onOpen,
  onCreate,
}: {
  datasets: DatasetRecord[];
  currentUserId: string | null;
  membersById: Map<string, LabMemberRecord>;
  projectsById: Map<string, ProjectOptionRecord>;
  tagsByDatasetId: Map<string, { tag: string }[]>;
  linksByDatasetId: Map<string, { project_id: string }[]>;
  requests: DatasetAccessRequestRecord[];
  onOpen: (datasetId: string) => void;
  onCreate: () => void;
}) {
  const owned = datasets.filter((dataset) => dataset.owner_user_id === currentUserId || dataset.created_by === currentUserId);
  const requestedIds = new Set(requests.filter((request) => request.requester_user_id === currentUserId).map((request) => request.dataset_id));
  const requested = datasets.filter((dataset) => requestedIds.has(dataset.id));
  const incomplete = owned.filter(
    (dataset) => !dataset.description || (!dataset.external_accession && !dataset.citation && !dataset.primary_storage_uri)
  );
  return (
    <div className="dh-stack">
      <DatasetListPanel title="Owned by me" datasets={owned} empty="You do not own any registered datasets yet." onOpen={onOpen} membersById={membersById} projectsById={projectsById} tagsByDatasetId={tagsByDatasetId} linksByDatasetId={linksByDatasetId} />
      <DatasetListPanel title="Requested by me" datasets={requested} empty="You have not requested access to any datasets yet." onOpen={onOpen} membersById={membersById} projectsById={projectsById} tagsByDatasetId={tagsByDatasetId} linksByDatasetId={linksByDatasetId} />
      <DatasetListPanel title="Pending metadata completion" datasets={incomplete} empty="No owned datasets need obvious metadata follow-up." onOpen={onOpen} membersById={membersById} projectsById={projectsById} tagsByDatasetId={tagsByDatasetId} linksByDatasetId={linksByDatasetId} />
      {datasets.length === 0 ? (
        <EmptyState
          boxed
          title="No datasets registered yet"
          description="Create the first dataset record to make lab data easier to find, reuse, and cite."
          action={<Button variant="primary" onClick={onCreate}>+ New dataset</Button>}
        />
      ) : null}
    </div>
  );
}

function DatasetListPanel(props: {
  title: string;
  datasets: DatasetRecord[];
  empty: string;
  onOpen: (datasetId: string) => void;
  membersById: Map<string, LabMemberRecord>;
  projectsById: Map<string, ProjectOptionRecord>;
  tagsByDatasetId: Map<string, { tag: string }[]>;
  linksByDatasetId: Map<string, { project_id: string }[]>;
}) {
  return (
    <Panel>
      <SectionHeader title={props.title} meta={`${props.datasets.length}`} />
      {props.datasets.length === 0 ? (
        <EmptyState description={props.empty} />
      ) : (
        <div className="dh-card-grid">
          {props.datasets.map((dataset) => (
            <button key={dataset.id} type="button" className="dh-dataset-card" onClick={() => props.onOpen(dataset.id)}>
              <div className="dh-card-head">
                <strong>{dataset.name}</strong>
                <StatusPill status={datasetStatusTone(dataset.status)}>{labelize(dataset.status)}</StatusPill>
              </div>
              <p>{dataset.description ?? "No description yet."}</p>
              <div className="dh-card-meta">
                {labelize(dataset.dataset_type)} / {memberLabel(props.membersById.get(dataset.owner_user_id ?? ""), dataset.owner_user_id)}
              </div>
              <CompactProjectList links={props.linksByDatasetId.get(dataset.id) ?? []} projectsById={props.projectsById} />
              <TagList tags={(props.tagsByDatasetId.get(dataset.id) ?? []).map((tag) => tag.tag)} compact />
            </button>
          ))}
        </div>
      )}
    </Panel>
  );
}

function RequestsDashboard({
  requests,
  datasets,
  projectsById,
  membersById,
  currentUserId,
  isAdmin,
  onOpenDataset,
  onReview,
  onWithdraw,
}: {
  requests: DatasetAccessRequestRecord[];
  datasets: DatasetRecord[];
  projectsById: Map<string, ProjectOptionRecord>;
  membersById: Map<string, LabMemberRecord>;
  currentUserId: string | null;
  isAdmin: boolean;
  onOpenDataset: (datasetId: string) => void;
  onReview: (request: DatasetAccessRequestRecord, decision: "approved" | "denied") => void;
  onWithdraw: (requestId: string) => void;
}) {
  const datasetsById = new Map(datasets.map((dataset) => [dataset.id, dataset]));
  return (
    <Panel>
      <SectionHeader title="Dataset access requests" meta={`${requests.length}`} />
      <div className="dh-table-scroll">
        <Table>
          <thead>
            <tr>
              <th>Dataset</th>
              <th>Requester</th>
              <th>Project</th>
              <th>Access</th>
              <th>Status</th>
              <th>Intended use</th>
              <th>Created</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <TableEmpty colSpan={8}>No dataset requests yet. When someone requests access to a dataset, it will appear here.</TableEmpty>
            ) : (
              requests.map((request) => {
                const dataset = datasetsById.get(request.dataset_id);
                const canReview =
                  request.status === "pending" &&
                  (isAdmin || dataset?.owner_user_id === currentUserId || dataset?.contact_user_id === currentUserId);
                const canWithdraw = request.status === "pending" && request.requester_user_id === currentUserId;
                return (
                  <tr key={request.id}>
                    <td>
                      {dataset ? (
                        <button type="button" className="dh-link-button" onClick={() => onOpenDataset(dataset.id)}>
                          {dataset.name}
                        </button>
                      ) : (
                        request.dataset_id
                      )}
                    </td>
                    <td>{memberLabel(membersById.get(request.requester_user_id ?? ""), request.requester_user_id)}</td>
                    <td>{projectsById.get(request.project_id ?? "")?.name ?? "-"}</td>
                    <td>{labelize(request.requested_access_type)}</td>
                    <td><Badge tone={requestTone(request.status)}>{labelize(request.status)}</Badge></td>
                    <td className="dh-note-cell">{request.intended_use}</td>
                    <td>{formatDate(request.created_at)}</td>
                    <td className="dh-actions-cell">
                      {canReview ? (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => onReview(request, "approved")}>Approve</Button>
                          <Button size="sm" variant="ghost" onClick={() => onReview(request, "denied")}>Deny</Button>
                        </>
                      ) : null}
                      {canWithdraw ? (
                        <Button size="sm" variant="ghost" onClick={() => onWithdraw(request.id)}>Withdraw</Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </Table>
      </div>
    </Panel>
  );
}

function DatasetDetailView({
  dataset,
  canEdit,
  currentUserId,
  isAdmin,
  membersById,
  projectsById,
  tags,
  projectLinks,
  versions,
  requests,
  storageLinks,
  onBack,
  onEdit,
  onArchive,
  onRestore,
  onAddVersion,
  onRequestAccess,
  onReview,
  onWithdraw,
}: {
  dataset: DatasetRecord;
  canEdit: boolean;
  currentUserId: string | null;
  isAdmin: boolean;
  membersById: Map<string, LabMemberRecord>;
  projectsById: Map<string, ProjectOptionRecord>;
  tags: { tag: string }[];
  projectLinks: Array<{ id: string; project_id: string; relationship_type: string; note: string | null }>;
  versions: DatasetVersionRecord[];
  requests: DatasetAccessRequestRecord[];
  storageLinks: DatasetStorageLinkRecord[];
  onBack: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onAddVersion: () => void;
  onRequestAccess: () => void;
  onReview: (request: DatasetAccessRequestRecord, decision: "approved" | "denied") => void;
  onWithdraw: (requestId: string) => void;
}) {
  const owner = membersById.get(dataset.owner_user_id ?? "");
  const contact = membersById.get(dataset.contact_user_id ?? "");
  const requestAction = getRequestAction(dataset, requests, currentUserId);

  return (
    <div className="dh-stack">
      <Panel>
        <div className="dh-detail-head">
          <div>
            <Button size="sm" variant="ghost" onClick={onBack}>Back</Button>
            <h2>{dataset.name}</h2>
            <div className="dh-badge-row">
              <StatusPill status={datasetStatusTone(dataset.status)}>{labelize(dataset.status)}</StatusPill>
              <Badge tone={accessTone(dataset.access_level)}>{labelize(dataset.access_level)}</Badge>
              {dataset.archived_at ? <Badge tone="neutral">Archived</Badge> : null}
            </div>
          </div>
          <div className="dh-actions-row">
            {requestAction ? (
              <Button
                variant={requestAction.disabled ? "secondary" : "primary"}
                disabled={requestAction.disabled}
                onClick={() => {
                  if (!requestAction.disabled) onRequestAccess();
                }}
              >
                {requestAction.label}
              </Button>
            ) : null}
            {canEdit ? <Button variant="secondary" onClick={onEdit}>Edit</Button> : null}
            {canEdit && dataset.archived_at ? (
              <Button variant="ghost" onClick={onRestore}>Restore</Button>
            ) : canEdit ? (
              <Button variant="ghost" onClick={onArchive}>Archive</Button>
            ) : null}
          </div>
        </div>
        <p className="dh-detail-description">{dataset.description ?? "No description yet."}</p>
      </Panel>

      <div className="dh-detail-grid">
        <Panel>
          <SectionHeader title="Summary" />
          <DescriptionList
            rows={[
              ["Type", labelize(dataset.dataset_type)],
              ["Source", labelize(dataset.source_type)],
              ["Owner", memberLabel(owner, dataset.owner_user_id)],
              ["Contact", memberLabel(contact, dataset.contact_user_id)],
              ["Assay / platform", dataset.assay_platform ?? "-"],
              ["Organism", dataset.organism ?? "-"],
              ["Sample type", dataset.sample_type ?? "-"],
              ["External accession", dataset.external_accession ?? "-"],
              ["License", dataset.license ?? "-"],
            ]}
          />
          <TagList tags={tags.map((tag) => tag.tag)} />
        </Panel>

        <Panel>
          <SectionHeader title="Storage / location" meta={`${storageLinks.length}`} />
          {storageLinks.length === 0 ? (
            <EmptyState description="No visible storage locations. Access approval may be required for paths or links." />
          ) : (
            <div className="dh-storage-list">
              {storageLinks.map((link) => (
                <div key={link.id} className="dh-storage-row">
                  <span>{link.label ?? labelize(link.storage_type)}</span>
                  <code>{link.storage_uri}</code>
                  {link.notes ? <small>{link.notes}</small> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <div className="dh-detail-grid">
        <Panel>
          <SectionHeader title="Scientific context" />
          <DescriptionList
            rows={[
              ["Recommended use", dataset.recommended_use ?? "-"],
              ["Do not use for", dataset.not_recommended_use ?? "-"],
              ["QC summary", dataset.qc_summary ?? "-"],
              ["Usage conditions", dataset.usage_conditions ?? "-"],
              ["Citation", dataset.citation ?? "-"],
            ]}
          />
        </Panel>
        <Panel>
          <SectionHeader title="Linked projects" meta={`${projectLinks.length}`} />
          {projectLinks.length === 0 ? (
            <EmptyState description="No project links yet." />
          ) : (
            <div className="dh-link-list">
              {projectLinks.map((link) => (
                <div key={link.id} className="dh-link-row">
                  <strong>{projectsById.get(link.project_id)?.name ?? link.project_id}</strong>
                  <Badge tone="info">{labelize(link.relationship_type)}</Badge>
                  {link.note ? <small>{link.note}</small> : null}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <SectionHeader
          title="Versions / lineage"
          meta={`${versions.length}`}
          actions={canEdit ? <Button size="sm" variant="secondary" onClick={onAddVersion}>+ Add version</Button> : null}
        />
        <VersionList versions={versions} storageLinks={storageLinks} />
      </Panel>

      <RequestsDashboard
        requests={requests}
        datasets={[dataset]}
        projectsById={projectsById}
        membersById={membersById}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onOpenDataset={() => undefined}
        onReview={onReview}
        onWithdraw={onWithdraw}
      />

      {dataset.notes ? (
        <Panel>
          <SectionHeader title="Notes" />
          <p className="dh-note-text">{dataset.notes}</p>
        </Panel>
      ) : null}
    </div>
  );
}

function VersionList({
  versions,
  storageLinks,
}: {
  versions: DatasetVersionRecord[];
  storageLinks: DatasetStorageLinkRecord[];
}) {
  if (versions.length === 0) {
    return <EmptyState description="No versions recorded yet." />;
  }
  const versionsById = new Map(versions.map((version) => [version.id, version]));
  return (
    <div className="dh-table-scroll">
      <Table>
        <thead>
          <tr>
            <th>Version</th>
            <th>Type</th>
            <th>Parent</th>
            <th>Processing</th>
            <th>QC</th>
            <th>Location</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((version) => {
            const location = storageLinks.find((link) => link.dataset_version_id === version.id);
            return (
              <tr key={version.id}>
                <td>
                  <strong>{version.version_name}</strong>
                  <div className="dh-cell-meta">{version.description ?? ""}</div>
                </td>
                <td>{labelize(version.version_type)}</td>
                <td>{version.parent_version_id ? versionsById.get(version.parent_version_id)?.version_name ?? "Parent version" : "-"}</td>
                <td className="dh-note-cell">{version.processing_summary ?? "-"}</td>
                <td className="dh-note-cell">{version.qc_summary ?? "-"}</td>
                <td>{location ? <code>{location.storage_uri}</code> : "-"}</td>
                <td>{formatDate(version.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

function DatasetFormModal({
  dataset,
  projects,
  labMembers,
  tags,
  projectLinks,
  storageLinks,
  currentUserId,
  onClose,
  onSubmit,
}: {
  dataset: DatasetRecord | null;
  projects: ProjectOptionRecord[];
  labMembers: LabMemberRecord[];
  tags: { tag: string }[];
  projectLinks: ProjectLinkInput[];
  storageLinks: DatasetStorageLinkRecord[];
  currentUserId: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    data: DatasetInput;
    tags: string[];
    projectLinks: ProjectLinkInput[];
    storageUri?: string | null;
  }) => Promise<void>;
}) {
  const primaryStorage = storageLinks.find((link) => !link.dataset_version_id)?.storage_uri ?? "";
  const [name, setName] = useState(dataset?.name ?? "");
  const [description, setDescription] = useState(dataset?.description ?? "");
  const [datasetType, setDatasetType] = useState(dataset?.dataset_type ?? "other");
  const [sourceType, setSourceType] = useState<SourceType>(dataset?.source_type ?? "internal-generated");
  const [status, setStatus] = useState<DatasetStatus>(dataset?.status ?? "planned");
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(dataset?.access_level ?? "request-required");
  const [ownerUserId, setOwnerUserId] = useState(dataset?.owner_user_id ?? currentUserId ?? "");
  const [contactUserId, setContactUserId] = useState(dataset?.contact_user_id ?? dataset?.owner_user_id ?? currentUserId ?? "");
  const [organism, setOrganism] = useState(dataset?.organism ?? "");
  const [sampleType, setSampleType] = useState(dataset?.sample_type ?? "");
  const [assayPlatform, setAssayPlatform] = useState(dataset?.assay_platform ?? "");
  const [storageUri, setStorageUri] = useState(primaryStorage);
  const [externalAccession, setExternalAccession] = useState(dataset?.external_accession ?? "");
  const [citation, setCitation] = useState(dataset?.citation ?? "");
  const [license, setLicense] = useState(dataset?.license ?? "");
  const [usageConditions, setUsageConditions] = useState(dataset?.usage_conditions ?? "");
  const [recommendedUse, setRecommendedUse] = useState(dataset?.recommended_use ?? "");
  const [notRecommendedUse, setNotRecommendedUse] = useState(dataset?.not_recommended_use ?? "");
  const [qcSummary, setQcSummary] = useState(dataset?.qc_summary ?? "");
  const [notes, setNotes] = useState(dataset?.notes ?? "");
  const [tagText, setTagText] = useState(tags.map((tag) => tag.tag).join(", "));
  const [selectedProjectIds, setSelectedProjectIds] = useState(new Set(projectLinks.map((link) => link.project_id)));
  const [relationshipType, setRelationshipType] = useState<ProjectLinkInput["relationship_type"]>(
    projectLinks[0]?.relationship_type ?? "used-by"
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Dataset name is required.");
      return;
    }
    if (!storageUri.trim() && !externalAccession.trim() && !citation.trim()) {
      setError("Add at least one storage URI, external accession, or citation.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        data: {
          name,
          description,
          dataset_type: datasetType,
          source_type: sourceType,
          status,
          access_level: accessLevel,
          owner_user_id: ownerUserId || null,
          contact_user_id: contactUserId || null,
          organism,
          sample_type: sampleType,
          assay_platform: assayPlatform,
          external_accession: externalAccession,
          citation,
          license,
          usage_conditions: usageConditions,
          recommended_use: recommendedUse,
          not_recommended_use: notRecommendedUse,
          qc_summary: qcSummary,
          notes,
        },
        tags: splitTags(tagText),
        projectLinks: Array.from(selectedProjectIds).map((projectId) => ({
          project_id: projectId,
          relationship_type: relationshipType,
        })),
        storageUri,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleProject = (projectId: string) => {
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <Modal open onClose={onClose} title={dataset ? "Edit dataset" : "Register dataset"} width="wide">
      <form className="dh-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        {accessLevel === "restricted" || accessLevel === "private" ? (
          <InlineNote>Restricted and private datasets reduce discoverability. Use them only when metadata visibility itself is sensitive.</InlineNote>
        ) : null}
        <FormField label="Dataset name *">
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </FormField>
        <FormField label="Description">
          <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
        <FormRow>
          <FormField label="Dataset type">
            <Select value={datasetType} onChange={(event) => setDatasetType(event.target.value as typeof datasetType)}>
              {DATASET_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
            </Select>
          </FormField>
          <FormField label="Source type">
            <Select value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType)}>
              {SOURCE_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select value={status} onChange={(event) => setStatus(event.target.value as DatasetStatus)}>
              {DATASET_STATUSES.map((option) => <option key={option} value={option}>{labelize(option)}</option>)}
            </Select>
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Access level">
            <Select value={accessLevel} onChange={(event) => setAccessLevel(event.target.value as AccessLevel)}>
              {ACCESS_LEVELS.map((level) => <option key={level} value={level}>{labelize(level)}</option>)}
            </Select>
          </FormField>
          <FormField label="Owner">
            <MemberSelect value={ownerUserId} onChange={setOwnerUserId} members={labMembers} />
          </FormField>
          <FormField label="Contact">
            <MemberSelect value={contactUserId} onChange={setContactUserId} members={labMembers} />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="Organism">
            <Input value={organism} onChange={(event) => setOrganism(event.target.value)} />
          </FormField>
          <FormField label="Sample type">
            <Input value={sampleType} onChange={(event) => setSampleType(event.target.value)} />
          </FormField>
          <FormField label="Assay / platform">
            <Input value={assayPlatform} onChange={(event) => setAssayPlatform(event.target.value)} />
          </FormField>
        </FormRow>
        <FormField label="Primary storage URI" hint="ILM stores this location reference, not the dataset files.">
          <Input value={storageUri} onChange={(event) => setStorageUri(event.target.value)} placeholder="/mnt/isilon/... or https://..." />
        </FormField>
        <FormRow>
          <FormField label="External accession">
            <Input value={externalAccession} onChange={(event) => setExternalAccession(event.target.value)} />
          </FormField>
          <FormField label="Citation / DOI">
            <Input value={citation} onChange={(event) => setCitation(event.target.value)} />
          </FormField>
          <FormField label="License">
            <Input value={license} onChange={(event) => setLicense(event.target.value)} />
          </FormField>
        </FormRow>
        <FormField label="Usage conditions">
          <Textarea rows={2} value={usageConditions} onChange={(event) => setUsageConditions(event.target.value)} />
        </FormField>
        <FormRow>
          <FormField label="Recommended use">
            <Textarea rows={3} value={recommendedUse} onChange={(event) => setRecommendedUse(event.target.value)} />
          </FormField>
          <FormField label="Do not use for" hint="Note analyses where this dataset may mislead, underpower, or bias results.">
            <Textarea rows={3} value={notRecommendedUse} onChange={(event) => setNotRecommendedUse(event.target.value)} />
          </FormField>
        </FormRow>
        <FormField label="QC summary">
          <Textarea rows={2} value={qcSummary} onChange={(event) => setQcSummary(event.target.value)} />
        </FormField>
        <FormField label="Tags" hint="Comma-separated">
          <Input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="RNA004, riboswitch, benchmark" />
        </FormField>
        <fieldset className="dh-fieldset">
          <legend>Linked projects</legend>
          <FormField label="Relationship">
            <Select value={relationshipType} onChange={(event) => setRelationshipType(event.target.value as ProjectLinkInput["relationship_type"])}>
              {["generated-by", "used-by", "derived-from", "supports-publication", "external-reference", "validation", "training", "benchmark"].map((option) => (
                <option key={option} value={option}>{labelize(option)}</option>
              ))}
            </Select>
          </FormField>
          <div className="dh-checkbox-grid">
            {projects.length === 0 ? <span className="dh-muted">No projects available.</span> : null}
            {projects.map((project) => (
              <label key={project.id} className="dh-checkbox">
                <input
                  type="checkbox"
                  checked={selectedProjectIds.has(project.id)}
                  onChange={() => toggleProject(project.id)}
                />
                {project.name}
              </label>
            ))}
          </div>
        </fieldset>
        <FormField label="Notes">
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </FormField>
        <div className="rl-modal-actions">
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving..." : "Save dataset"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function VersionFormModal({
  datasetId,
  versions,
  onClose,
  onSubmit,
}: {
  datasetId: string;
  versions: DatasetVersionRecord[];
  onClose: () => void;
  onSubmit: (payload: { datasetId: string; data: VersionInput; storageUri?: string | null }) => Promise<void>;
}) {
  const [versionName, setVersionName] = useState("");
  const [versionType, setVersionType] = useState<VersionInput["version_type"]>("processed");
  const [description, setDescription] = useState("");
  const [parentVersionId, setParentVersionId] = useState("");
  const [storageUri, setStorageUri] = useState("");
  const [processingSummary, setProcessingSummary] = useState("");
  const [softwareEnvironment, setSoftwareEnvironment] = useState("");
  const [qcSummary, setQcSummary] = useState("");
  const [fileSummary, setFileSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!versionName.trim()) {
      setError("Version name is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        datasetId,
        storageUri,
        data: {
          version_name: versionName,
          version_type: versionType,
          description,
          parent_version_id: parentVersionId || null,
          processing_summary: processingSummary,
          software_environment: softwareEnvironment,
          qc_summary: qcSummary,
          file_summary: fileSummary,
          notes,
        },
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Add dataset version" width="wide">
      <form className="dh-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormRow>
          <FormField label="Version name *">
            <Input value={versionName} onChange={(event) => setVersionName(event.target.value)} placeholder="processed-v1" required />
          </FormField>
          <FormField label="Version type">
            <Select value={versionType} onChange={(event) => setVersionType(event.target.value as VersionInput["version_type"])}>
              {VERSION_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
            </Select>
          </FormField>
          <FormField label="Parent version">
            <Select value={parentVersionId} onChange={(event) => setParentVersionId(event.target.value)}>
              <option value="">None</option>
              {versions.map((version) => <option key={version.id} value={version.id}>{version.version_name}</option>)}
            </Select>
          </FormField>
        </FormRow>
        <FormField label="Description">
          <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
        </FormField>
        <FormField label="Storage URI">
          <Input value={storageUri} onChange={(event) => setStorageUri(event.target.value)} />
        </FormField>
        <FormRow>
          <FormField label="Processing summary">
            <Textarea rows={3} value={processingSummary} onChange={(event) => setProcessingSummary(event.target.value)} />
          </FormField>
          <FormField label="Software environment">
            <Textarea rows={3} value={softwareEnvironment} onChange={(event) => setSoftwareEnvironment(event.target.value)} />
          </FormField>
        </FormRow>
        <FormRow>
          <FormField label="QC summary">
            <Textarea rows={2} value={qcSummary} onChange={(event) => setQcSummary(event.target.value)} />
          </FormField>
          <FormField label="File summary">
            <Textarea rows={2} value={fileSummary} onChange={(event) => setFileSummary(event.target.value)} />
          </FormField>
        </FormRow>
        <FormField label="Notes">
          <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </FormField>
        <div className="rl-modal-actions">
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Saving..." : "Add version"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function AccessRequestModal({
  dataset,
  projects,
  versions,
  onClose,
  onSubmit,
}: {
  dataset: DatasetRecord | null;
  projects: ProjectOptionRecord[];
  versions: DatasetVersionRecord[];
  onClose: () => void;
  onSubmit: (payload: {
    datasetId: string;
    datasetVersionId?: string | null;
    projectId?: string | null;
    intendedUse: string;
    requestedAccessType: RequestAccessType;
  }) => Promise<void>;
}) {
  const [datasetVersionId, setDatasetVersionId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [requestedAccessType, setRequestedAccessType] = useState<RequestAccessType>("reuse-in-project");
  const [intendedUse, setIntendedUse] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!dataset) {
      setError("Dataset is no longer available.");
      return;
    }
    if (!intendedUse.trim()) {
      setError("Intended use is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        datasetId: dataset.id,
        datasetVersionId: datasetVersionId || null,
        projectId: projectId || null,
        requestedAccessType,
        intendedUse,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Request dataset access">
      <form className="dh-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <InlineNote>
          Tell the owner how you plan to use this dataset. For open-lab datasets this records reuse; for controlled datasets it requests access and may reveal storage locations after approval.
        </InlineNote>
        <FormField label="Dataset">
          <Input value={dataset?.name ?? ""} disabled />
        </FormField>
        <FormField label="Dataset version">
          <Select value={datasetVersionId} onChange={(event) => setDatasetVersionId(event.target.value)}>
            <option value="">Any / latest appropriate version</option>
            {versions.map((version) => <option key={version.id} value={version.id}>{version.version_name}</option>)}
          </Select>
        </FormField>
        <FormField label="Requesting project">
          <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">No project selected</option>
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </Select>
        </FormField>
        <FormField label="Requested access">
          <Select value={requestedAccessType} onChange={(event) => setRequestedAccessType(event.target.value as RequestAccessType)}>
            {REQUEST_ACCESS_TYPES.map((type) => <option key={type} value={type}>{labelize(type)}</option>)}
          </Select>
        </FormField>
        <FormField label="Intended use *">
          <Textarea rows={4} value={intendedUse} onChange={(event) => setIntendedUse(event.target.value)} required />
        </FormField>
        <div className="rl-modal-actions">
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>{busy ? "Submitting..." : "Submit request"}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ReviewRequestModal({
  request,
  decision,
  onClose,
  onSubmit,
}: {
  request: DatasetAccessRequestRecord;
  decision: "approved" | "denied";
  onClose: () => void;
  onSubmit: (payload: {
    requestId: string;
    status: "approved" | "denied";
    decisionNote?: string | null;
    conditions?: string | null;
    createProjectLink?: boolean;
  }) => Promise<void>;
}) {
  const [decisionNote, setDecisionNote] = useState("");
  const [conditions, setConditions] = useState("");
  const [createProjectLink, setCreateProjectLink] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (decision === "denied" && !decisionNote.trim()) {
      setError("A denial note is required.");
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        requestId: request.id,
        status: decision,
        decisionNote,
        conditions,
        createProjectLink,
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={decision === "approved" ? "Approve request" : "Deny request"}>
      <form className="dh-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        <FormField label="Decision note">
          <Textarea rows={3} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} />
        </FormField>
        {decision === "approved" ? (
          <>
            <FormField label="Conditions">
              <Textarea rows={2} value={conditions} onChange={(event) => setConditions(event.target.value)} />
            </FormField>
            <label className="dh-checkbox">
              <input
                type="checkbox"
                checked={createProjectLink}
                onChange={(event) => setCreateProjectLink(event.target.checked)}
              />
              Record approved reuse as a used-by project link
            </label>
          </>
        ) : null}
        <div className="rl-modal-actions">
          <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={decision === "approved" ? "primary" : "danger"} disabled={busy}>
            {busy ? "Saving..." : decision === "approved" ? "Approve" : "Deny"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function MemberSelect({
  value,
  onChange,
  members,
}: {
  value: string;
  onChange: (value: string) => void;
  members: LabMemberRecord[];
}) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">None</option>
      {members.map((member) => (
        <option key={member.user_id} value={member.user_id}>{memberLabel(member)}</option>
      ))}
    </Select>
  );
}

function TagList({ tags, compact }: { tags: string[]; compact?: boolean }) {
  if (tags.length === 0) return <span className="dh-muted">-</span>;
  const visible = compact ? tags.slice(0, 4) : tags;
  return (
    <div className="dh-tag-list">
      {visible.map((tag) => <span key={tag} className="dh-tag">{tag}</span>)}
      {compact && tags.length > visible.length ? <span className="dh-tag">+{tags.length - visible.length}</span> : null}
    </div>
  );
}

function CompactProjectList({
  links,
  projectsById,
}: {
  links: Array<{ project_id: string }>;
  projectsById: Map<string, ProjectOptionRecord>;
}) {
  if (links.length === 0) return <span className="dh-muted">-</span>;
  return (
    <div className="dh-project-list">
      {links.slice(0, 2).map((link) => (
        <span key={link.project_id}>{projectsById.get(link.project_id)?.name ?? "Project"}</span>
      ))}
      {links.length > 2 ? <span>+{links.length - 2}</span> : null}
    </div>
  );
}

function DescriptionList({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="dh-description-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function groupBy<T extends Record<K, string>, K extends keyof T>(items: T[], key: K): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const value = item[key];
    const next = map.get(value) ?? [];
    next.push(item);
    map.set(value, next);
  }
  return map;
}

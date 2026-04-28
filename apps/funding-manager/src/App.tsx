import { useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  CheckboxField,
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
  Table,
  TableEmpty,
  TableLoading,
  Textarea,
  useAuth,
  type LabMemberRecord,
} from "@ilm/ui";
import {
  fundingVisibilityLabel,
  getFundingStatus,
  type FundingSourceRecord,
  type FundingStatus,
  type FundingVisibility,
} from "@ilm/utils";
import { useFundingWorkspace } from "./lib/useFundingWorkspace";

const APP_BASE_URL = import.meta.env.BASE_URL;

const VISIBILITY_OPTIONS: FundingVisibility[] = ["reviewer_only", "lab_visible_alias"];

type StatusFilter = "all" | "active" | "expiring" | "expired" | "archived";

type ModalState =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "edit"; sourceId: string };

const formatDate = (value: string | null | undefined): string => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
};

const errorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const c = err as { message?: unknown; details?: unknown; hint?: unknown };
    if (typeof c.message === "string" && c.message.trim()) {
      const detail =
        typeof c.details === "string" && c.details.trim()
          ? ` (${c.details})`
          : typeof c.hint === "string" && c.hint.trim()
          ? ` (${c.hint})`
          : "";
      return c.message + detail;
    }
  }
  return "Unexpected error";
};

const memberLabel = (m: LabMemberRecord): string =>
  m.display_name?.trim() || m.email?.trim() || m.user_id;

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

const FundingStatusBadge = ({ status }: { status: FundingStatus }) => (
  <Badge tone={status.badgeTone}>{status.label}</Badge>
);

// ---------------------------------------------------------------------------
// Root app
// ---------------------------------------------------------------------------

export const App = () => {
  const { activeLab } = useAuth();
  const labId = activeLab?.id ?? null;
  const isAdmin = activeLab?.role === "owner" || activeLab?.role === "admin";

  const workspace = useFundingWorkspace(labId);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [piFilter, setPiFilter] = useState<string>("all");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | FundingVisibility>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const [actionError, setActionError] = useState<string | null>(null);

  const closeModal = () => setModal({ kind: "none" });

  const wrap = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setActionError(null);
    try {
      return await fn();
    } catch (err) {
      setActionError(errorMessage(err));
      return null;
    }
  };

  const piById = useMemo(() => {
    const map = new Map<string, LabMemberRecord>();
    for (const m of workspace.labMembers) map.set(m.user_id, m);
    return map;
  }, [workspace.labMembers]);

  const sourcesById = useMemo(() => {
    const map = new Map<string, FundingSourceRecord>();
    for (const s of workspace.fundingSources) map.set(s.id, s);
    return map;
  }, [workspace.fundingSources]);

  const filteredSources = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspace.fundingSources.filter((s) => {
      const status = getFundingStatus(s);
      if (!showArchived && status.kind === "archived") return false;
      if (statusFilter === "active" && status.kind !== "active" && status.kind !== "no_window") return false;
      if (statusFilter === "expiring" && status.kind !== "expiring_soon" && status.kind !== "ending_soon") return false;
      if (statusFilter === "expired" && status.kind !== "expired") return false;
      if (statusFilter === "archived" && status.kind !== "archived") return false;
      if (visibilityFilter !== "all" && s.visibility !== visibilityFilter) return false;
      if (piFilter !== "all" && s.pi_id !== piFilter) return false;
      if (q) {
        const haystack = [s.nickname, s.brief_note ?? "", s.grant_identifier ?? ""].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [workspace.fundingSources, search, statusFilter, piFilter, visibilityFilter, showArchived]);

  const piOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const s of workspace.fundingSources) {
      if (s.pi_id) ids.add(s.pi_id);
    }
    return [...ids]
      .map((id) => piById.get(id) ?? ({ user_id: id, display_name: null, email: null, role: "member", joined_at: "" } as LabMemberRecord))
      .sort((a, b) => memberLabel(a).localeCompare(memberLabel(b)));
  }, [workspace.fundingSources, piById]);

  const editingSource =
    modal.kind === "edit" ? sourcesById.get(modal.sourceId) ?? null : null;

  return (
    <LabShell
      activeNavId="funding"
      baseUrl={APP_BASE_URL}
      topbar={
        <LabTopbar
          kicker="FUNDING DIRECTORY"
          title="Funding Directory"
          subtitle="Manage PI-approved funding aliases and grant identifiers for order routing. No budget or cost tracking is stored."
        />
      }
    >
      {workspace.error ? <ErrorBanner>{workspace.error}</ErrorBanner> : null}
      {actionError ? <ErrorBanner>{actionError}</ErrorBanner> : null}

      <Panel className="funding-directory-panel">
        <SectionHeader
          title="Funding sources"
          meta={`${filteredSources.length} of ${workspace.fundingSources.length}`}
          actions={
            isAdmin ? (
              <Button variant="primary" onClick={() => setModal({ kind: "create" })}>
                + Add funding source
              </Button>
            ) : null
          }
        />

        {!isAdmin ? (
          <InlineNote>
            You are viewing the lab-visible funding aliases. Grant identifiers are only visible to lab admins / reviewers.
          </InlineNote>
        ) : null}

        <div className="funding-filter-bar">
          <FormField label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search nickname, note, or grant id"
            />
          </FormField>
          <FormField label="Status">
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="expiring">Expiring</option>
              <option value="expired">Expired</option>
              <option value="archived">Archived</option>
            </Select>
          </FormField>
          {isAdmin ? (
            <FormField label="Visibility">
              <Select
                value={visibilityFilter}
                onChange={(e) => setVisibilityFilter(e.target.value as "all" | FundingVisibility)}
              >
                <option value="all">All</option>
                <option value="reviewer_only">Reviewer only</option>
                <option value="lab_visible_alias">Lab-visible alias</option>
              </Select>
            </FormField>
          ) : null}
          {piOptions.length > 0 ? (
            <FormField label="PI / owner">
              <Select value={piFilter} onChange={(e) => setPiFilter(e.target.value)}>
                <option value="all">All</option>
                {piOptions.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {memberLabel(m)}
                  </option>
                ))}
              </Select>
            </FormField>
          ) : null}
          {isAdmin ? (
            <CheckboxField
              label="Show archived"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
          ) : null}
        </div>

        <div className="funding-table-scroll">
          <Table>
            <thead>
              <tr>
                <th>Nickname</th>
                {isAdmin ? <th>Grant identifier</th> : null}
                <th>PI / owner</th>
                <th>Valid period</th>
                <th>Status</th>
                {isAdmin ? <th>Visibility</th> : null}
                <th>Brief note</th>
                {isAdmin ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {workspace.status === "loading" ? (
                <TableLoading colSpan={isAdmin ? 8 : 5} />
              ) : filteredSources.length === 0 ? (
                <TableEmpty colSpan={isAdmin ? 8 : 5}>
                  {workspace.fundingSources.length === 0
                    ? isAdmin
                      ? "No funding sources yet. Add one to start routing approved orders."
                      : "No funding aliases are visible to lab members yet."
                    : "No funding sources match the current filters."}
                </TableEmpty>
              ) : (
                filteredSources.map((source) => {
                  const status = getFundingStatus(source);
                  const pi = source.pi_id ? piById.get(source.pi_id) : null;
                  return (
                    <tr key={source.id}>
                      <td>
                        <strong>{source.nickname}</strong>
                      </td>
                      {isAdmin ? (
                        <td>
                          <code className="funding-grant-id">{source.grant_identifier ?? "—"}</code>
                        </td>
                      ) : null}
                      <td>{pi ? memberLabel(pi) : source.pi_id ? "—" : ""}</td>
                      <td>
                        {formatDate(source.valid_start_date)} → {formatDate(source.valid_end_date)}
                      </td>
                      <td>
                        <FundingStatusBadge status={status} />
                      </td>
                      {isAdmin ? (
                        <td>
                          <Badge tone={source.visibility === "reviewer_only" ? "info" : "neutral"}>
                            {fundingVisibilityLabel(source.visibility)}
                          </Badge>
                        </td>
                      ) : null}
                      <td className="funding-note-cell">{source.brief_note ?? ""}</td>
                      {isAdmin ? (
                        <td className="funding-action-cell">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setModal({ kind: "edit", sourceId: source.id })}
                          >
                            Edit
                          </Button>
                          {source.archived_at ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await wrap(() => workspace.restoreFundingSource(source.id));
                              }}
                            >
                              Restore
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                await wrap(() => workspace.archiveFundingSource(source.id));
                              }}
                            >
                              Archive
                            </Button>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>
      </Panel>

      {workspace.fundingSources.length === 0 && workspace.status === "ready" && !isAdmin ? (
        <EmptyState
          title="Nothing to show"
          description="Lab admins haven't published any funding aliases that are visible to members yet. Approved orders will still get a funding source attached during review."
        />
      ) : null}

      {modal.kind === "create" ? (
        <FundingSourceFormModal
          mode="create"
          source={null}
          labMembers={workspace.labMembers}
          onClose={closeModal}
          onSubmit={async (values) => {
            const created = await wrap(() => workspace.createFundingSource(values));
            if (created) closeModal();
          }}
        />
      ) : null}

      {modal.kind === "edit" && editingSource ? (
        <FundingSourceFormModal
          mode="edit"
          source={editingSource}
          labMembers={workspace.labMembers}
          onClose={closeModal}
          onSubmit={async (values, deltas) => {
            const updated = await wrap(() =>
              workspace.updateFundingSource({ id: editingSource.id, ...values, ...deltas })
            );
            if (updated) closeModal();
          }}
        />
      ) : null}
    </LabShell>
  );
};

// ---------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------

interface FormValues {
  nickname: string;
  grantIdentifier: string;
  piId: string | null;
  validStartDate: string | null;
  validEndDate: string | null;
  briefNote: string | null;
  visibility: FundingVisibility;
}

interface FormDeltas {
  clearPi?: boolean;
  clearValidStart?: boolean;
  clearValidEnd?: boolean;
  clearBriefNote?: boolean;
}

const FundingSourceFormModal = ({
  mode,
  source,
  labMembers,
  onClose,
  onSubmit,
}: {
  mode: "create" | "edit";
  source: FundingSourceRecord | null;
  labMembers: LabMemberRecord[];
  onClose: () => void;
  onSubmit: (values: FormValues, deltas: FormDeltas) => Promise<void>;
}) => {
  const [nickname, setNickname] = useState(source?.nickname ?? "");
  const [grantIdentifier, setGrantIdentifier] = useState(source?.grant_identifier ?? "");
  const [piId, setPiId] = useState<string>(source?.pi_id ?? "");
  const [validStartDate, setValidStartDate] = useState(source?.valid_start_date ?? "");
  const [validEndDate, setValidEndDate] = useState(source?.valid_end_date ?? "");
  const [briefNote, setBriefNote] = useState(source?.brief_note ?? "");
  const [visibility, setVisibility] = useState<FundingVisibility>(source?.visibility ?? "reviewer_only");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const endIsPast = validEndDate && validEndDate < today;
  const endBeforeStart = validStartDate && validEndDate && validEndDate < validStartDate;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!nickname.trim()) {
      setError("Nickname is required.");
      return;
    }
    if (!grantIdentifier.trim()) {
      setError("Grant identifier is required.");
      return;
    }
    if (endBeforeStart) {
      setError("End date must be on or after start date.");
      return;
    }

    const values: FormValues = {
      nickname: nickname.trim(),
      grantIdentifier: grantIdentifier.trim(),
      piId: piId || null,
      validStartDate: validStartDate || null,
      validEndDate: validEndDate || null,
      briefNote: briefNote.trim() || null,
      visibility,
    };

    // For edit mode, communicate explicit "clear this" intent so the RPC can
    // distinguish "leave alone" from "set to null".
    const deltas: FormDeltas = {};
    if (mode === "edit" && source) {
      if (source.pi_id && !piId) deltas.clearPi = true;
      if (source.valid_start_date && !validStartDate) deltas.clearValidStart = true;
      if (source.valid_end_date && !validEndDate) deltas.clearValidEnd = true;
      if (source.brief_note && !briefNote.trim()) deltas.clearBriefNote = true;
    }

    setBusy(true);
    try {
      await onSubmit(values, deltas);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? "Add funding source" : "Edit funding source"}
      width="default"
    >
      <form className="funding-modal-form" onSubmit={handleSubmit}>
        {error ? <InlineError>{error}</InlineError> : null}
        {endIsPast && !endBeforeStart ? (
          <InlineNote>
            <strong>Heads up:</strong> the end date you entered is in the past. The source will save as <em>expired</em>.
          </InlineNote>
        ) : null}

        <FormField label="Nickname *">
          <Input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. RNA Structure Grant"
            required
          />
        </FormField>

        <FormField
          label="Grant identifier *"
          hint="The actual grant / account identifier used during ordering. Visible only to lab reviewers."
        >
          <Input
            value={grantIdentifier}
            onChange={(e) => setGrantIdentifier(e.target.value)}
            placeholder="e.g. NIH-R01-XXXXXXX-01"
            required
          />
        </FormField>

        <FormField label="PI / owner">
          <Select value={piId} onChange={(e) => setPiId(e.target.value)}>
            <option value="">— None —</option>
            {labMembers.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormRow>
          <FormField label="Valid from">
            <Input
              type="date"
              value={validStartDate ?? ""}
              onChange={(e) => setValidStartDate(e.target.value)}
            />
          </FormField>
          <FormField label="Valid until">
            <Input
              type="date"
              value={validEndDate ?? ""}
              onChange={(e) => setValidEndDate(e.target.value)}
            />
          </FormField>
        </FormRow>

        <FormField
          label="Visibility *"
          hint="Reviewer-only sources never surface to regular members. Lab-visible alias hides only the grant identifier."
        >
          <Select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as FundingVisibility)}
          >
            {VISIBILITY_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {fundingVisibilityLabel(v)}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="Brief note">
          <Textarea
            rows={3}
            value={briefNote}
            onChange={(e) => setBriefNote(e.target.value)}
            placeholder="Use for sequencing-related reagents and consumables."
          />
        </FormField>

        <div className="rl-modal-actions">
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? "Saving…" : mode === "create" ? "Create" : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

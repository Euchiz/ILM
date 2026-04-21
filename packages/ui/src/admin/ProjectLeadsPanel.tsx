import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  assignProjectLead,
  listLabMembers,
  listProjectLeads,
  listProjects,
  revokeProjectLead,
  type LabMemberRecord,
  type ProjectLeadRecord,
  type ProjectRecord,
} from "./api";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const implicitLeadRoles = new Set(["owner", "admin"]);

export const ProjectLeadsPanel = ({
  projectId: explicitProjectId = null,
  labId: explicitLabId,
  title = "Project Leads",
}: {
  projectId?: string | null;
  labId?: string | null;
  title?: string;
}) => {
  const { activeLab } = useAuth();
  const labId = explicitLabId ?? activeLab?.id ?? null;
  const canManage = activeLab?.role === "owner" || activeLab?.role === "admin";
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [members, setMembers] = useState<LabMemberRecord[]>([]);
  const [leadRows, setLeadRows] = useState<ProjectLeadRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(explicitProjectId);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedProjectId(explicitProjectId ?? null);
  }, [explicitProjectId]);

  const loadBase = useCallback(async () => {
    if (!labId || !canManage) {
      setProjects([]);
      setMembers([]);
      setLeadRows([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextProjects, nextMembers] = await Promise.all([
        listProjects(labId),
        listLabMembers(labId),
      ]);
      setProjects(nextProjects);
      setMembers(nextMembers);
      const resolvedProjectId = explicitProjectId ?? nextProjects[0]?.id ?? null;
      setSelectedProjectId(resolvedProjectId);
      if (resolvedProjectId) {
        setLeadRows(await listProjectLeads(resolvedProjectId));
      } else {
        setLeadRows([]);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canManage, explicitProjectId, labId]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  const loadLeads = useCallback(async (projectId: string | null) => {
    if (!projectId || !canManage) {
      setLeadRows([]);
      return;
    }
    try {
      setLeadRows(await listProjectLeads(projectId));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [canManage]);

  useEffect(() => {
    if (!selectedProjectId) return;
    void loadLeads(selectedProjectId);
  }, [loadLeads, selectedProjectId]);

  const explicitLeadIds = useMemo(() => new Set(leadRows.map((row) => row.user_id)), [leadRows]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const explicitLeads = members.filter((member) => explicitLeadIds.has(member.user_id));
  const implicitLeads = members.filter((member) => implicitLeadRoles.has(member.role));
  const assignableMembers = members.filter(
    (member) => !explicitLeadIds.has(member.user_id) && !implicitLeadRoles.has(member.role)
  );

  useEffect(() => {
    if (!selectedUserId && assignableMembers.length > 0) {
      setSelectedUserId(assignableMembers[0].user_id);
    }
    if (selectedUserId && !assignableMembers.some((member) => member.user_id === selectedUserId)) {
      setSelectedUserId(assignableMembers[0]?.user_id ?? "");
    }
  }, [assignableMembers, selectedUserId]);

  const handleAssign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId || !selectedUserId) return;

    setAssigning(true);
    setError(null);
    try {
      await assignProjectLead(selectedProjectId, selectedUserId);
      await loadLeads(selectedProjectId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  const handleRevoke = async (userId: string) => {
    if (!selectedProjectId) return;
    setBusyUserId(userId);
    setError(null);
    try {
      await revokeProjectLead(selectedProjectId, userId);
      await loadLeads(selectedProjectId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <section className="ilm-admin-card">
      <div className="ilm-admin-header">
        <div>
          <h2>{title}</h2>
          <p className="ilm-auth-note">
            {canManage
              ? "Assign explicit reviewers per project. Lab owners and admins are always implicit leads."
              : "Only lab owners and admins can manage project leads."}
          </p>
        </div>
        <span className="ilm-admin-pill">{explicitLeads.length} explicit</span>
      </div>

      {error ? <p className="ilm-auth-error">{error}</p> : null}

      {!canManage ? (
        <p className="ilm-admin-empty">Only lab admins can assign or revoke project leads.</p>
      ) : loading ? (
        <p className="ilm-admin-empty">Loading projects and member roster...</p>
      ) : projects.length === 0 ? (
        <p className="ilm-admin-empty">No projects are available in this lab yet.</p>
      ) : (
        <>
          {!explicitProjectId ? (
            <label className="ilm-auth-field">
              <span>Project</span>
              <select value={selectedProjectId ?? ""} onChange={(event) => setSelectedProjectId(event.target.value || null)}>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.approval_required ? " - review required" : " - no review"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {selectedProject ? (
            <div className="ilm-admin-project-meta">
              <strong>{selectedProject.name}</strong>
              <span>{selectedProject.approval_required ? "Review required" : "No review gate"}</span>
            </div>
          ) : null}

          <form className="ilm-admin-form" onSubmit={handleAssign}>
            <div className="ilm-admin-form-header">
              <h3>Assign Explicit Lead</h3>
              <span className="ilm-admin-helper">Admins and owners already review implicitly.</span>
            </div>
            <div className="ilm-admin-field-row">
              <label className="ilm-auth-field">
                <span>Member</span>
                <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} disabled={assignableMembers.length === 0}>
                  {assignableMembers.length === 0 ? <option value="">No additional members available</option> : null}
                  {assignableMembers.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.display_name || member.email || member.user_id}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="ilm-auth-submit" disabled={!selectedProjectId || !selectedUserId || assigning}>
              {assigning ? "Assigning..." : "Assign lead"}
            </button>
          </form>

          <div className="ilm-admin-split">
            <div>
              <div className="ilm-admin-form-header">
                <h3>Explicit Leads</h3>
                <span className="ilm-admin-helper">{explicitLeads.length} assigned</span>
              </div>
              {explicitLeads.length === 0 ? (
                <p className="ilm-admin-empty">No explicit leads assigned yet.</p>
              ) : (
                <ul className="ilm-admin-list">
                  {explicitLeads.map((member) => (
                    <li className="ilm-admin-list-item" key={member.user_id}>
                      <div className="ilm-admin-list-copy">
                        <strong>{member.display_name || member.email || member.user_id}</strong>
                        <span>{member.email || "No email available"}</span>
                        <small>{member.role}</small>
                      </div>
                      <div className="ilm-admin-actions">
                        <button
                          type="button"
                          className="ilm-text-button"
                          disabled={busyUserId === member.user_id}
                          onClick={() => void handleRevoke(member.user_id)}
                        >
                          Revoke
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="ilm-admin-form-header">
                <h3>Implicit Leads</h3>
                <span className="ilm-admin-helper">Owners and admins always qualify</span>
              </div>
              {implicitLeads.length === 0 ? (
                <p className="ilm-admin-empty">No admins or owners in this lab yet.</p>
              ) : (
                <ul className="ilm-admin-list">
                  {implicitLeads.map((member) => (
                    <li className="ilm-admin-list-item" key={member.user_id}>
                      <div className="ilm-admin-list-copy">
                        <strong>{member.display_name || member.email || member.user_id}</strong>
                        <span>{member.email || "No email available"}</span>
                        <small>{member.role}</small>
                      </div>
                      <div className="ilm-admin-actions">
                        <span className={`ilm-admin-badge ilm-admin-badge-${member.role}`}>{member.role}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
};

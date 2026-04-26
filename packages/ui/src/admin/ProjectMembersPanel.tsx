import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  assignProjectMember,
  listLabMembers,
  listProjectLeads,
  listProjectMembers,
  listProjects,
  revokeProjectMember,
  type LabMemberRecord,
  type ProjectLeadRecord,
  type ProjectMemberRecord,
  type ProjectRecord,
} from "./api";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const implicitLeadRoles = new Set(["owner", "admin"]);

export const ProjectMembersPanel = ({
  projectId: explicitProjectId = null,
  labId: explicitLabId,
  title = "Project Members",
  onChanged,
}: {
  projectId?: string | null;
  labId?: string | null;
  title?: string;
  onChanged?: () => Promise<void> | void;
}) => {
  const { activeLab, user } = useAuth();
  const labId = explicitLabId ?? activeLab?.id ?? null;
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [members, setMembers] = useState<LabMemberRecord[]>([]);
  const [memberRows, setMemberRows] = useState<ProjectMemberRecord[]>([]);
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

  const loadProjectAccess = useCallback(async (projectId: string | null) => {
    if (!projectId) {
      setMemberRows([]);
      setLeadRows([]);
      return;
    }
    const [nextMembers, nextLeads] = await Promise.all([
      listProjectMembers(projectId),
      listProjectLeads(projectId),
    ]);
    setMemberRows(nextMembers);
    setLeadRows(nextLeads);
  }, []);

  const loadBase = useCallback(async () => {
    if (!labId) {
      setProjects([]);
      setMembers([]);
      setMemberRows([]);
      setLeadRows([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextProjects, nextMembers] = await Promise.all([
        explicitProjectId ? Promise.resolve<ProjectRecord[]>([]) : listProjects(labId),
        listLabMembers(labId),
      ]);
      setProjects(nextProjects);
      setMembers(nextMembers);

      const resolvedProjectId = explicitProjectId ?? nextProjects[0]?.id ?? null;
      setSelectedProjectId(resolvedProjectId);
      await loadProjectAccess(resolvedProjectId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [explicitProjectId, labId, loadProjectAccess]);

  useEffect(() => {
    void loadBase();
  }, [loadBase]);

  useEffect(() => {
    if (!selectedProjectId) return;
    void loadProjectAccess(selectedProjectId).catch((err) => setError(errorMessage(err)));
  }, [loadProjectAccess, selectedProjectId]);

  const explicitMemberIds = useMemo(() => new Set(memberRows.map((row) => row.user_id)), [memberRows]);
  const explicitLeadIds = useMemo(() => new Set(leadRows.map((row) => row.user_id)), [leadRows]);
  const selectedProject = projects.find((project) => project.id === selectedProjectId) ?? null;
  const canManage =
    activeLab?.role === "owner" ||
    activeLab?.role === "admin" ||
    (!!user?.id && explicitLeadIds.has(user.id));

  const explicitMembers = members.filter(
    (member) =>
      explicitMemberIds.has(member.user_id) &&
      !implicitLeadRoles.has(member.role) &&
      !explicitLeadIds.has(member.user_id)
  );
  const higherAccessMembers = members.filter(
    (member) => implicitLeadRoles.has(member.role) || explicitLeadIds.has(member.user_id)
  );
  const assignableMembers = members.filter(
    (member) =>
      !explicitMemberIds.has(member.user_id) &&
      !explicitLeadIds.has(member.user_id) &&
      !implicitLeadRoles.has(member.role)
  );

  useEffect(() => {
    if (!selectedUserId && assignableMembers.length > 0) {
      setSelectedUserId(assignableMembers[0].user_id);
    }
    if (selectedUserId && !assignableMembers.some((member) => member.user_id === selectedUserId)) {
      setSelectedUserId(assignableMembers[0]?.user_id ?? "");
    }
  }, [assignableMembers, selectedUserId]);

  const refreshAfterChange = async () => {
    await loadProjectAccess(selectedProjectId);
    await onChanged?.();
  };

  const handleAssign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedProjectId || !selectedUserId || !canManage) return;

    setAssigning(true);
    setError(null);
    try {
      await assignProjectMember(selectedProjectId, selectedUserId);
      await refreshAfterChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  const handleRevoke = async (targetUserId: string) => {
    if (!selectedProjectId || !canManage) return;
    setBusyUserId(targetUserId);
    setError(null);
    try {
      await revokeProjectMember(selectedProjectId, targetUserId);
      await refreshAfterChange();
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
              ? "Assign project members who can edit project information and roadmap records."
              : "Project leads and lab admins can manage project members."}
          </p>
        </div>
        <span className="ilm-admin-pill">{explicitMembers.length} explicit</span>
      </div>

      {error ? <p className="ilm-auth-error">{error}</p> : null}

      {loading ? (
        <p className="ilm-admin-empty">Loading project access...</p>
      ) : !explicitProjectId && projects.length === 0 ? (
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

          {canManage ? (
            <form className="ilm-admin-form" onSubmit={handleAssign}>
              <div className="ilm-admin-form-header">
                <h3>Assign Member</h3>
                <span className="ilm-admin-helper">Leads, admins, and owners already have higher access.</span>
              </div>
              <div className="ilm-admin-field-row">
                <label className="ilm-auth-field">
                  <span>Lab member</span>
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
                {assigning ? "Assigning..." : "Assign member"}
              </button>
            </form>
          ) : null}

          <div className="ilm-admin-split">
            <div>
              <div className="ilm-admin-form-header">
                <h3>Project Members</h3>
                <span className="ilm-admin-helper">{explicitMembers.length} assigned</span>
              </div>
              {explicitMembers.length === 0 ? (
                <p className="ilm-admin-empty">No explicit members assigned yet.</p>
              ) : (
                <ul className="ilm-admin-list">
                  {explicitMembers.map((member) => (
                    <li className="ilm-admin-list-item" key={member.user_id}>
                      <div className="ilm-admin-list-copy">
                        <strong>{member.display_name || member.email || member.user_id}</strong>
                        <span>{member.email || "No email available"}</span>
                        <small>{member.role}</small>
                      </div>
                      {canManage ? (
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
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="ilm-admin-form-header">
                <h3>Higher Access</h3>
                <span className="ilm-admin-helper">Leads and lab admins qualify</span>
              </div>
              {higherAccessMembers.length === 0 ? (
                <p className="ilm-admin-empty">No leads or admins are assigned yet.</p>
              ) : (
                <ul className="ilm-admin-list">
                  {higherAccessMembers.map((member) => (
                    <li className="ilm-admin-list-item" key={member.user_id}>
                      <div className="ilm-admin-list-copy">
                        <strong>{member.display_name || member.email || member.user_id}</strong>
                        <span>{member.email || "No email available"}</span>
                        <small>{explicitLeadIds.has(member.user_id) ? "project lead" : member.role}</small>
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

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  demoteAdminToMember,
  listLabMembers,
  promoteMemberToAdmin,
  type LabMemberRecord,
} from "./api";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

export const LabSettingsPanel = ({ title = "Lab Settings (Owner)" }: { title?: string }) => {
  const { activeLab } = useAuth();
  const labId = activeLab?.id ?? null;
  const isOwner = activeLab?.role === "owner";
  const [members, setMembers] = useState<LabMemberRecord[]>([]);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!labId || !isOwner) {
      setMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await listLabMembers(labId);
      rows.sort((a, b) => (a.display_name ?? a.email ?? "").localeCompare(b.display_name ?? b.email ?? ""));
      setMembers(rows);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [isOwner, labId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isOwner) return null;

  const handlePromote = async (m: LabMemberRecord) => {
    if (!labId) return;
    setBusyUserId(m.user_id);
    setError(null);
    try {
      await promoteMemberToAdmin(labId, m.user_id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const handleDemote = async (m: LabMemberRecord) => {
    if (!labId) return;
    setBusyUserId(m.user_id);
    setError(null);
    try {
      await demoteAdminToMember(labId, m.user_id);
      await load();
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
            Only the lab owner can promote a member to admin or demote an admin back to member.
          </p>
        </div>
        <span className="ilm-admin-pill">{members.length} members</span>
      </div>
      {error ? <p className="ilm-auth-error">{error}</p> : null}
      {loading ? <p className="ilm-admin-empty">Loading roster…</p> : null}
      {!loading && members.length === 0 ? <p className="ilm-admin-empty">No members yet.</p> : null}
      {!loading && members.length > 0 ? (
        <ul className="ilm-admin-list">
          {members.map((m) => (
            <li key={m.user_id} className="ilm-admin-list-item">
              <div className="ilm-admin-list-copy">
                <strong>{m.display_name || m.email || m.user_id}</strong>
                <span>{m.email || "No email available"}</span>
                <small>{m.role}</small>
              </div>
              <div className="ilm-admin-actions">
                {m.role === "member" ? (
                  <button
                    type="button"
                    className="ilm-text-button"
                    disabled={busyUserId === m.user_id}
                    onClick={() => void handlePromote(m)}
                  >
                    Promote to admin
                  </button>
                ) : null}
                {m.role === "admin" ? (
                  <button
                    type="button"
                    className="ilm-text-button"
                    disabled={busyUserId === m.user_id}
                    onClick={() => void handleDemote(m)}
                  >
                    Demote to member
                  </button>
                ) : null}
                {m.role === "owner" ? (
                  <span className="ilm-admin-badge ilm-admin-badge-owner">owner</span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};

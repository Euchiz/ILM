import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  inviteMemberToLab,
  listLabInvitations,
  listLabMembers,
  removeLabMember,
  type LabInvitationRecord,
  type LabMemberRecord,
} from "./api";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const formatJoinedAt = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));

export const LabMembersPanel = ({
  labId: explicitLabId,
  title = "Lab Members",
}: {
  labId?: string | null;
  title?: string;
}) => {
  const { activeLab, user, refreshLabs } = useAuth();
  const labId = explicitLabId ?? activeLab?.id ?? null;
  const canManage = activeLab?.role === "owner" || activeLab?.role === "admin";
  const [members, setMembers] = useState<LabMemberRecord[]>([]);
  const [invitations, setInvitations] = useState<LabInvitationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [submittingInvite, setSubmittingInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!labId || !canManage) {
      setMembers([]);
      setInvitations([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [nextMembers, nextInvitations] = await Promise.all([
        listLabMembers(labId),
        listLabInvitations(labId),
      ]);
      setMembers(nextMembers);
      setInvitations(nextInvitations);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canManage, labId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === "pending"),
    [invitations]
  );

  const handleRemove = async (member: LabMemberRecord) => {
    if (!labId || member.role === "owner") return;
    const confirmed = window.confirm(`Remove ${member.display_name || member.email || "this member"} from ${activeLab?.name ?? "the lab"}?`);
    if (!confirmed) return;

    setBusyUserId(member.user_id);
    setError(null);
    try {
      await removeLabMember(labId, member.user_id);
      await load();
      await refreshLabs();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!labId || !inviteEmail.trim()) return;

    setSubmittingInvite(true);
    setError(null);
    try {
      await inviteMemberToLab(labId, inviteEmail.trim(), inviteRole);
      setInviteEmail("");
      setInviteRole("member");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmittingInvite(false);
    }
  };

  return (
    <section className="ilm-admin-card">
      <div className="ilm-admin-header">
        <div>
          <h2>{title}</h2>
          <p className="ilm-auth-note">
            {canManage
              ? "Promote admins, remove members, and track pending invitations."
              : "Only lab owners and admins can manage membership."}
          </p>
        </div>
        <span className="ilm-admin-pill">{members.length} members</span>
      </div>

      {error ? <p className="ilm-auth-error">{error}</p> : null}

      {!canManage ? (
        <p className="ilm-admin-empty">You can view this app, but only lab admins can manage membership.</p>
      ) : loading ? (
        <p className="ilm-admin-empty">Loading member roster...</p>
      ) : (
        <>
          <ul className="ilm-admin-list">
            {members.map((member) => {
              const label = member.display_name || member.email || member.user_id;
              const isSelf = member.user_id === user?.id;
              const isBusy = busyUserId === member.user_id;
              return (
                <li className="ilm-admin-list-item" key={member.user_id}>
                  <div className="ilm-admin-list-copy">
                    <strong>{label}</strong>
                    <span>{member.email || "No email available"}</span>
                    <small>Joined {formatJoinedAt(member.joined_at)}{isSelf ? " • You" : ""}</small>
                  </div>
                  <div className="ilm-admin-actions">
                    <span className={`ilm-admin-badge ilm-admin-badge-${member.role}`}>{member.role}</span>
                    {member.role !== "owner" ? (
                      <button
                        type="button"
                        className="ilm-text-button"
                        disabled={isBusy}
                        onClick={() => void handleRemove(member)}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="ilm-admin-helper">Owner</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <form className="ilm-admin-form" onSubmit={handleInvite}>
            <div className="ilm-admin-form-header">
              <h3>Invite Member</h3>
              <span className="ilm-admin-helper">Invited users are added automatically when they sign in with this email.</span>
            </div>
            <div className="ilm-admin-field-row">
              <label className="ilm-auth-field">
                <span>Email</span>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder="scientist@lab.org"
                />
              </label>
              <label className="ilm-auth-field">
                <span>Role</span>
                <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <button type="submit" className="ilm-auth-submit" disabled={submittingInvite}>
              {submittingInvite ? "Saving invite..." : "Save invitation"}
            </button>
          </form>

          <div className="ilm-admin-invitations">
            <div className="ilm-admin-form-header">
              <h3>Pending Invitations</h3>
              <span className="ilm-admin-helper">{pendingInvitations.length} pending</span>
            </div>
            {pendingInvitations.length === 0 ? (
              <p className="ilm-admin-empty">No pending invitations for this lab.</p>
            ) : (
              <ul className="ilm-admin-list">
                {pendingInvitations.map((invitation) => (
                  <li className="ilm-admin-list-item" key={invitation.id}>
                    <div className="ilm-admin-list-copy">
                      <strong>{invitation.email}</strong>
                      <span>{invitation.role}</span>
                      <small>Saved {formatJoinedAt(invitation.created_at)}</small>
                    </div>
                    <div className="ilm-admin-actions">
                      <span className="ilm-admin-badge ilm-admin-badge-pending">{invitation.status}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
};

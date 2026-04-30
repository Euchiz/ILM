import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  approveLabJoin,
  buildLabShareUrl,
  cancelLabJoin,
  demoteAdminToMember,
  inviteMemberToLab,
  listLabInvitations,
  listLabJoinRequests,
  listLabMembers,
  promoteMemberToAdmin,
  rejectLabJoin,
  removeLabMember,
  useAuth,
  type LabInvitationRecord,
  type LabJoinRequestRecord,
  type LabMemberRecord,
} from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL || "/";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

type MembershipTier = "owner" | "admin" | "member";

const TIER_LABEL: Record<MembershipTier, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const MembersPanel = () => {
  const { activeLab, user, refreshLabs } = useAuth();
  const labId = activeLab?.id ?? null;
  const tier: MembershipTier = (activeLab?.role as MembershipTier | undefined) ?? "member";
  const isOwner = tier === "owner";
  const isAdmin = tier === "admin";
  const canManageMembers = isOwner || isAdmin;
  const canManageAdmins = isOwner;
  const [members, setMembers] = useState<LabMemberRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!labId) {
      setMembers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setMembers(await listLabMembers(labId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshAfterAction = useCallback(async () => {
    await Promise.all([load(), refreshLabs()]);
  }, [load, refreshLabs]);

  const doPromote = async (member: LabMemberRecord) => {
    if (!labId) return;
    setBusyUserId(member.user_id);
    setError(null);
    try {
      await promoteMemberToAdmin(labId, member.user_id);
      await refreshAfterAction();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const doDemote = async (member: LabMemberRecord) => {
    if (!labId) return;
    setBusyUserId(member.user_id);
    setError(null);
    try {
      await demoteAdminToMember(labId, member.user_id);
      await refreshAfterAction();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  const doRemove = async (member: LabMemberRecord) => {
    if (!labId) return;
    const label = member.display_name || member.email || "this member";
    if (!window.confirm(`Remove ${label} from ${activeLab?.name ?? "the lab"}?`)) return;
    setBusyUserId(member.user_id);
    setError(null);
    try {
      await removeLabMember(labId, member.user_id);
      await refreshAfterAction();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  if (!activeLab) {
    return <p className="acct-empty">Pick a lab to see its members.</p>;
  }

  return (
    <section className="acct-card">
      <div className="acct-card-header">
        <div>
          <h2>Lab members</h2>
          <p>
            {canManageMembers
              ? "Owner > admin > member. Admins and the owner can promote members and remove members. Only the owner can demote or remove an admin."
              : "Only admins and the owner can edit membership."}
          </p>
        </div>
        <span className="acct-card-pill">{members.length} total</span>
      </div>

      {error ? <p className="acct-error">{error}</p> : null}
      {loading ? <p className="acct-empty">Loading roster…</p> : null}

      {!loading && members.length > 0 ? (
        <ul className="acct-member-list">
          {members.map((member) => {
            const label = member.display_name || member.email || member.user_id;
            const isSelf = member.user_id === user?.id;
            const busy = busyUserId === member.user_id;
            const targetTier = member.role as MembershipTier;
            const canPromote = canManageMembers && targetTier === "member" && !isSelf;
            const canDemote = canManageAdmins && targetTier === "admin";
            const canRemove =
              !isSelf &&
              targetTier !== "owner" &&
              (targetTier === "admin" ? canManageAdmins : canManageMembers);

            return (
              <li className="acct-member" key={member.user_id}>
                <div className="acct-member-copy">
                  <strong>
                    {label}
                    {isSelf ? " (you)" : ""}
                  </strong>
                  <span>{member.email || "No email available"}</span>
                  <small>Joined {formatDate(member.joined_at)}</small>
                </div>
                <div className="acct-member-actions">
                  <span className={`acct-badge ${targetTier}`}>{TIER_LABEL[targetTier]}</span>
                  {canPromote ? (
                    <button type="button" className="acct-text-button" disabled={busy} onClick={() => void doPromote(member)}>
                      Promote to admin
                    </button>
                  ) : null}
                  {canDemote ? (
                    <button type="button" className="acct-text-button" disabled={busy} onClick={() => void doDemote(member)}>
                      Demote to member
                    </button>
                  ) : null}
                  {canRemove ? (
                    <button type="button" className="acct-danger-button" disabled={busy} onClick={() => void doRemove(member)}>
                      Remove
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {!loading && members.length === 0 ? <p className="acct-empty">No members yet.</p> : null}
    </section>
  );
};

const InvitationsPanel = () => {
  const { activeLab } = useAuth();
  const labId = activeLab?.id ?? null;
  const tier: MembershipTier = (activeLab?.role as MembershipTier | undefined) ?? "member";
  const canManageMembers = tier === "owner" || tier === "admin";

  const [invitations, setInvitations] = useState<LabInvitationRecord[]>([]);
  const [requests, setRequests] = useState<LabJoinRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member">("member");
  const [submittingInvite, setSubmittingInvite] = useState(false);

  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");

  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!labId || !canManageMembers) {
      setInvitations([]);
      setRequests([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextInvitations, nextRequests] = await Promise.all([
        listLabInvitations(labId),
        listLabJoinRequests(labId, "pending"),
      ]);
      setInvitations(nextInvitations);
      setRequests(nextRequests);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [labId, canManageMembers]);

  useEffect(() => {
    void load();
  }, [load]);

  const pendingInvitations = useMemo(
    () => invitations.filter((invitation) => invitation.status === "pending"),
    [invitations]
  );

  const shareUrl = useMemo(() => (activeLab ? buildLabShareUrl(activeLab.id, APP_BASE_URL) : ""), [activeLab]);

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

  const handleApprove = async (request: LabJoinRequestRecord) => {
    setBusyRequestId(request.id);
    setError(null);
    try {
      await approveLabJoin(request.id);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleReject = async (request: LabJoinRequestRecord) => {
    const comment = rejectComment.trim();
    if (!comment) {
      setError("A comment is required to reject a request.");
      return;
    }
    setBusyRequestId(request.id);
    setError(null);
    try {
      await rejectLabJoin(request.id, comment);
      setRejectOpen(null);
      setRejectComment("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl || typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!activeLab) {
    return <p className="acct-empty">Pick a lab first.</p>;
  }
  if (!canManageMembers) {
    return <p className="acct-empty">Only admins and the owner can send invitations or review join requests.</p>;
  }

  return (
    <>
      {error ? <p className="acct-error">{error}</p> : null}

      <section className="acct-card">
        <div className="acct-card-header">
          <div>
            <h2>Invite by email</h2>
            <p>Invited users are added automatically when they sign in with this email.</p>
          </div>
        </div>
        <form className="acct-form" onSubmit={handleInvite}>
          <div className="acct-field-row">
            <label className="acct-field">
              <span>Email</span>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="scientist@lab.org"
                required
              />
            </label>
            <label className="acct-field">
              <span>Role</span>
              <select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as "admin" | "member")}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
          </div>
          <div>
            <button type="submit" className="acct-primary-button" disabled={submittingInvite}>
              {submittingInvite ? "Saving…" : "Save invitation"}
            </button>
          </div>
        </form>

        {pendingInvitations.length > 0 ? (
          <div className="acct-invitations">
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--rl-muted)" }}>
              {pendingInvitations.length} pending
            </div>
            {pendingInvitations.map((invitation) => (
              <div className="acct-invitation" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <div>
                    <small>Saved {formatDate(invitation.created_at)}</small>
                  </div>
                </div>
                <span className="acct-badge">{invitation.role}</span>
                <span className="acct-badge">{invitation.status}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="acct-card">
        <div className="acct-card-header">
          <div>
            <h2>Share link</h2>
            <p>Anyone who opens this link can sign in and request to join {activeLab.name}.</p>
          </div>
        </div>
        <div className="acct-share-row">
          <input type="text" readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="acct-text-button" onClick={() => void handleCopy()}>
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
      </section>

      <section className="acct-card">
        <div className="acct-card-header">
          <div>
            <h2>Join requests</h2>
            <p>Approve or reject people who asked to join via the share link.</p>
          </div>
          <span className="acct-card-pill">{requests.length} pending</span>
        </div>
        {loading ? <p className="acct-empty">Loading…</p> : null}
        {!loading && requests.length === 0 ? <p className="acct-empty">No pending join requests.</p> : null}
        {requests.length > 0 ? (
          <div>
            {requests.map((request) => {
              const busy = busyRequestId === request.id;
              const label = request.display_name || request.email || request.user_id;
              const rejecting = rejectOpen === request.id;
              return (
                <div className="acct-request-item" key={request.id}>
                  <div>
                    <strong>{label}</strong>
                    <div>
                      <small>
                        {request.email || "No email available"} · requested {formatDate(request.created_at)}
                      </small>
                    </div>
                    {request.message ? <p className="acct-request-message">"{request.message}"</p> : null}
                  </div>
                  {rejecting ? (
                    <div className="acct-reject-form">
                      <textarea
                        value={rejectComment}
                        onChange={(event) => setRejectComment(event.target.value)}
                        placeholder="Reason (required)"
                        rows={2}
                      />
                      <div className="acct-row-actions">
                        <button
                          type="button"
                          className="acct-danger-button"
                          disabled={busy}
                          onClick={() => void handleReject(request)}
                        >
                          Confirm reject
                        </button>
                        <button
                          type="button"
                          className="acct-text-button"
                          disabled={busy}
                          onClick={() => {
                            setRejectOpen(null);
                            setRejectComment("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="acct-row-actions">
                      <button
                        type="button"
                        className="acct-primary-button"
                        disabled={busy}
                        onClick={() => void handleApprove(request)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="acct-text-button"
                        disabled={busy}
                        onClick={() => {
                          setRejectOpen(request.id);
                          setRejectComment("");
                        }}
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
      </section>
    </>
  );
};

export const TeamView = () => {
  const { activeLab } = useAuth();
  const [tab, setTab] = useState<"members" | "invitations">("members");
  const labId = activeLab?.id ?? null;
  const tier: MembershipTier = (activeLab?.role as MembershipTier | undefined) ?? "member";
  const canManageMembers = tier === "owner" || tier === "admin";
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!labId || !canManageMembers) {
      setPendingCount(0);
      return;
    }
    let cancelled = false;
    listLabJoinRequests(labId, "pending")
      .then((rows) => {
        if (!cancelled) setPendingCount(rows.length);
      })
      .catch(() => {
        if (!cancelled) setPendingCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [labId, canManageMembers, tab]);

  return (
    <div className="acct-team-page">
      <div className="acct-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className={`acct-tab${tab === "members" ? " is-active" : ""}`}
          aria-selected={tab === "members"}
          onClick={() => setTab("members")}
        >
          Members
        </button>
        <button
          type="button"
          role="tab"
          className={`acct-tab${tab === "invitations" ? " is-active" : ""}`}
          aria-selected={tab === "invitations"}
          onClick={() => setTab("invitations")}
        >
          Invitations &amp; Requests
          {pendingCount > 0 ? <span className="acct-tab-badge">{pendingCount}</span> : null}
        </button>
      </div>

      {tab === "members" ? <MembersPanel /> : <InvitationsPanel />}
    </div>
  );
};

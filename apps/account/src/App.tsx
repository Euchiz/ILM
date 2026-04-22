import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  AppSwitcher,
  AuthScreen,
  LabPicker,
  approveLabJoin,
  buildLabShareUrl,
  cancelLabJoin,
  demoteAdminToMember,
  inviteMemberToLab,
  listLabInvitations,
  listLabJoinRequests,
  listLabMembers,
  lookupLabById,
  promoteMemberToAdmin,
  rejectLabJoin,
  removeLabMember,
  requestLabJoin,
  useAuth,
  type LabInvitationRecord,
  type LabJoinRequestRecord,
  type LabLookupResult,
  type LabMemberRecord,
} from "@ilm/ui";
import { getSupabaseClient } from "@ilm/utils";

const APP_BASE_URL = import.meta.env.BASE_URL || "/";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));

const parseJoinLabId = (pathname: string, base: string): string | null => {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const pathBase = pathname.startsWith(normalizedBase) ? pathname.slice(normalizedBase.length) : pathname;
  const segments = pathBase.split("/").filter(Boolean);
  if (segments[0] === "join" && segments[1]) return segments[1];
  return null;
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// ---------------------------------------------------------------------------
// Left panel
// ---------------------------------------------------------------------------

type ProjectCounts = { total: number; drafts: number; pendingReview: number };

const useProjectCounts = (labId: string | null): ProjectCounts | null => {
  const [counts, setCounts] = useState<ProjectCounts | null>(null);
  useEffect(() => {
    if (!labId) {
      setCounts(null);
      return;
    }
    let cancelled = false;
    const supabase = getSupabaseClient();
    supabase
      .from("projects")
      .select("id, state, review_requested_at")
      .eq("lab_id", labId)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data) {
          setCounts({ total: 0, drafts: 0, pendingReview: 0 });
          return;
        }
        type Row = { state: string; review_requested_at: string | null };
        const rows = data as Row[];
        setCounts({
          total: rows.filter((r) => r.state === "published").length,
          drafts: rows.filter((r) => r.state === "draft").length,
          pendingReview: rows.filter((r) => r.state === "draft" && r.review_requested_at !== null).length,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [labId]);
  return counts;
};

type MembershipTier = "owner" | "admin" | "member";

const TIER_LABEL: Record<MembershipTier, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const TIER_DESCRIPTION: Record<MembershipTier, string> = {
  owner: "Full control: promote or demote admins, remove any non-owner, and manage the lab.",
  admin: "Can promote members to admin and remove members. Cannot touch other admins.",
  member: "Read-only in the lab management surface.",
};

const SidePanel = ({ onOpenLabPicker }: { onOpenLabPicker: () => void }) => {
  const { profile, user, activeLab, labs, selectLab, signOut } = useAuth();
  const counts = useProjectCounts(activeLab?.id ?? null);
  const displayName = profile?.display_name ?? user?.email ?? "Signed in";
  const email = profile?.email ?? user?.email ?? "";
  const tier: MembershipTier | null = (activeLab?.role as MembershipTier | undefined) ?? null;

  return (
    <aside className="acct-side" aria-label="Account summary">
      <div className="acct-side-header">
        <strong>Account</strong>
        <small>Integrated Lab Manager</small>
      </div>

      <section className="acct-side-section acct-side-profile">
        <h2>Profile</h2>
        <strong>{displayName}</strong>
        <span>{email}</span>
      </section>

      <section className="acct-side-section acct-lab-switcher">
        <h2>Active Lab</h2>
        {activeLab && tier ? (
          <>
            <h3>{activeLab.name}</h3>
            <span className={`acct-lab-role ${tier}`}>{TIER_LABEL[tier]}</span>
            <small style={{ color: "var(--acct-muted)" }}>{TIER_DESCRIPTION[tier]}</small>
          </>
        ) : (
          <h3>No lab selected</h3>
        )}
        {labs.length > 1 ? (
          <label className="acct-field" style={{ marginTop: "0.2rem" }}>
            <span>Switch lab</span>
            <select
              value={activeLab?.id ?? ""}
              onChange={(event) => {
                const nextId = event.target.value;
                if (nextId) selectLab(nextId);
              }}
            >
              {labs.map((lab) => (
                <option key={lab.id} value={lab.id}>
                  {lab.name} ({TIER_LABEL[lab.role as MembershipTier]})
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          type="button"
          className="acct-text-button"
          style={{ marginTop: "0.35rem", alignSelf: "flex-start" }}
          onClick={onOpenLabPicker}
        >
          Join or create another lab…
        </button>
      </section>

      <section className="acct-side-section">
        <h2>Projects in this lab</h2>
        <div className="acct-stat-row">
          <div className="acct-stat">
            <span className="acct-stat-value">{counts?.total ?? "–"}</span>
            <span className="acct-stat-label">Published</span>
          </div>
          <div className="acct-stat">
            <span className="acct-stat-value">{counts?.pendingReview ?? "–"}</span>
            <span className="acct-stat-label">In review</span>
          </div>
          <div className="acct-stat">
            <span className="acct-stat-value">{counts?.drafts ?? "–"}</span>
            <span className="acct-stat-label">Drafts</span>
          </div>
        </div>
      </section>

      <section className="acct-side-section">
        <h2>Working status</h2>
        <span style={{ fontSize: "0.85rem", color: "var(--acct-muted)" }}>
          {activeLab && tier
            ? `Signed in as ${TIER_LABEL[tier]} of ${activeLab.name}. Use the top-right switcher to open another app.`
            : "Pick a lab to get started."}
        </span>
      </section>

      <div className="acct-side-footer">
        <button type="button" className="acct-text-button" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </aside>
  );
};

// ---------------------------------------------------------------------------
// Members tab
// ---------------------------------------------------------------------------

const MembersTab = () => {
  const { activeLab, user } = useAuth();
  const labId = activeLab?.id ?? null;
  const tier: MembershipTier = (activeLab?.role as MembershipTier | undefined) ?? "member";
  // Strict stratification: owner > admin > member. Each user has exactly one
  // tier per lab (enforced by the `(lab_id, user_id)` PK on lab_memberships).
  const isOwner = tier === "owner";
  const isAdmin = tier === "admin";
  const canManageMembers = isOwner || isAdmin; // promote member → admin, remove member
  const canManageAdmins = isOwner;              // demote admin → member, remove admin
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

  const doPromote = async (member: LabMemberRecord) => {
    if (!labId) return;
    setBusyUserId(member.user_id);
    setError(null);
    try {
      await promoteMemberToAdmin(labId, member.user_id);
      await load();
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
      await load();
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
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyUserId(null);
    }
  };

  if (!activeLab) {
    return <p className="acct-empty">Pick a lab from the left panel to see its members.</p>;
  }

  return (
    <section className="acct-card">
      <div className="acct-card-header">
        <div>
          <h2>Lab members</h2>
          <p>
            {canManageMembers
              ? "Owner &gt; admin &gt; member. Admins and the owner can promote members and remove members. Only the owner can demote or remove an admin."
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
            // Promote member → admin: any manager (owner or admin) can do this
            // to non-self members.
            const canPromote = canManageMembers && targetTier === "member" && !isSelf;
            // Demote admin → member: owner only.
            const canDemote = canManageAdmins && targetTier === "admin";
            // Remove: owner cannot be removed; admins can only be removed by the
            // owner; members can be removed by any manager.
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

// ---------------------------------------------------------------------------
// Invitations tab
// ---------------------------------------------------------------------------

const InvitationsTab = () => {
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
    return <p className="acct-empty">Pick a lab from the left panel first.</p>;
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
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--acct-muted)" }}>
              {pendingInvitations.length} pending
            </div>
            {pendingInvitations.map((invitation) => (
              <div className="acct-invitation" key={invitation.id}>
                <div>
                  <strong>{invitation.email}</strong>
                  <div><small>Saved {formatDate(invitation.created_at)}</small></div>
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
                    <div><small>{request.email || "No email available"} · requested {formatDate(request.created_at)}</small></div>
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

// ---------------------------------------------------------------------------
// Dashboard + join routes + root
// ---------------------------------------------------------------------------

type ManagementTab = "members" | "invitations";

const AccountDashboard = ({ onOpenLabPicker }: { onOpenLabPicker: () => void }) => {
  const { activeLab } = useAuth();
  const [tab, setTab] = useState<ManagementTab>("members");
  const [pendingCount, setPendingCount] = useState<number>(0);
  const labId = activeLab?.id ?? null;
  const tier: MembershipTier = (activeLab?.role as MembershipTier | undefined) ?? "member";
  const canManageMembers = tier === "owner" || tier === "admin";

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
    <div className="acct-shell">
      <SidePanel onOpenLabPicker={onOpenLabPicker} />
      <main className="acct-main">
        <header className="acct-topbar">
          <div className="acct-topbar-copy">
            <p className="acct-kicker">Account</p>
            <h1>Lab Management</h1>
          </div>
          <div className="acct-topbar-actions">
            <AppSwitcher currentApp="home" baseUrl={APP_BASE_URL} />
          </div>
        </header>
        <nav className="acct-tabs" aria-label="Lab management tabs">
          <button
            type="button"
            className={`acct-tab${tab === "members" ? " active" : ""}`}
            onClick={() => setTab("members")}
          >
            Members
          </button>
          <button
            type="button"
            className={`acct-tab${tab === "invitations" ? " active" : ""}`}
            onClick={() => setTab("invitations")}
          >
            Invitations & Requests
            {pendingCount > 0 ? <span className="acct-tab-badge">{pendingCount}</span> : null}
          </button>
        </nav>
        <div className="acct-main-body">
          {tab === "members" ? <MembersTab /> : <InvitationsTab />}
        </div>
      </main>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Join-by-link route
// ---------------------------------------------------------------------------

const JoinScreen = ({ labId }: { labId: string }) => {
  const { status, labs, selectLab, signOut, profile, user } = useAuth();
  const [lookup, setLookup] = useState<LabLookupResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingRequestId, setPendingRequestId] = useState<string | null>(null);

  const refreshLookup = useCallback(async () => {
    if (status !== "signed-in") return;
    setLoading(true);
    setError(null);
    try {
      if (!isUuid(labId)) {
        setError("That share link doesn't point to a valid lab id.");
        setLookup(null);
        return;
      }
      const result = await lookupLabById(labId);
      if (!result) {
        setError("This lab could not be found. The link may be outdated.");
        setLookup(null);
        return;
      }
      setLookup(result);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [labId, status]);

  useEffect(() => {
    void refreshLookup();
  }, [refreshLookup]);

  if (status === "loading") {
    return (
      <div className="ilm-auth-screen">
        <div className="ilm-auth-card">
          <p className="ilm-auth-note">Loading…</p>
        </div>
      </div>
    );
  }
  if (status === "signed-out") return <AuthScreen />;

  const alreadyMember = lookup?.already_member ?? labs.some((l) => l.id === labId);
  const hasPending = (lookup?.has_pending_request ?? false) || pendingRequestId !== null;
  const labName = lookup?.name ?? "this lab";

  const handleOpenLab = () => {
    selectLab(labId);
    window.location.assign(APP_BASE_URL);
  };

  const handleRequest = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const id = await requestLabJoin(labId, message.trim() || undefined);
      setPendingRequestId(id);
      await refreshLookup();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!pendingRequestId) {
      await refreshLookup();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await cancelLabJoin(pendingRequestId);
      setPendingRequestId(null);
      await refreshLookup();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const displayName = profile?.display_name ?? user?.email ?? "";

  return (
    <div className="ilm-auth-screen">
      <div className="ilm-auth-card">
        <div className="ilm-lab-picker-header">
          <div>
            <h1 className="ilm-auth-title">Join a lab</h1>
            {displayName && <p className="ilm-auth-hint">Signed in as {displayName}</p>}
          </div>
          <button type="button" className="ilm-text-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>

        {loading ? (
          <p className="ilm-auth-note">Looking up lab…</p>
        ) : error ? (
          <p className="ilm-auth-error" role="alert">{error}</p>
        ) : alreadyMember ? (
          <>
            <p className="ilm-auth-note">You're already a member of <strong>{labName}</strong>.</p>
            <button type="button" className="ilm-auth-submit" onClick={handleOpenLab}>
              Open {labName}
            </button>
          </>
        ) : hasPending ? (
          <>
            <p className="ilm-auth-note">
              Your request to join <strong>{labName}</strong> is pending admin approval.
            </p>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button type="button" className="ilm-text-button" onClick={() => void refreshLookup()}>
                Refresh
              </button>
              {pendingRequestId ? (
                <button type="button" className="ilm-text-button" disabled={submitting} onClick={() => void handleCancel()}>
                  {submitting ? "Cancelling…" : "Cancel request"}
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <p className="ilm-auth-note">
              Request to join <strong>{labName}</strong>. A lab admin will review and approve.
            </p>
            <label className="ilm-auth-field">
              <span>Message (optional)</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Introduce yourself — who you are and why you want to join"
                rows={3}
              />
            </label>
            <button
              type="button"
              className="ilm-auth-submit"
              disabled={submitting}
              onClick={() => void handleRequest()}
            >
              {submitting ? "Submitting…" : "Request to join"}
            </button>
          </>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const SignedInShell = () => {
  const { activeLab } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const activeLabId = activeLab?.id ?? null;
  // When the user picks/creates a lab inside LabPicker, activeLabId changes.
  // Close the picker automatically so the dashboard re-mounts on the new lab.
  const prevIdRef = useRef<string | null>(activeLabId);
  useEffect(() => {
    if (showPicker && activeLabId && activeLabId !== prevIdRef.current) {
      setShowPicker(false);
    }
    prevIdRef.current = activeLabId;
  }, [activeLabId, showPicker]);

  if (!activeLab || showPicker) {
    return <LabPicker />;
  }
  return <AccountDashboard onOpenLabPicker={() => setShowPicker(true)} />;
};

export const App = () => {
  const { status } = useAuth();
  const joinLabId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return parseJoinLabId(window.location.pathname, APP_BASE_URL);
  }, []);

  if (joinLabId) return <JoinScreen labId={joinLabId} />;
  if (status === "loading") {
    return (
      <div className="ilm-auth-screen">
        <div className="ilm-auth-card">
          <p className="ilm-auth-note">Loading…</p>
        </div>
      </div>
    );
  }
  if (status === "signed-out") return <AuthScreen />;
  return <SignedInShell />;
};

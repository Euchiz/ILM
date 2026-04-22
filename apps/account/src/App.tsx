import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppSwitcher,
  AuthScreen,
  LabJoinRequestsPanel,
  LabMembersPanel,
  LabPicker,
  LabSettingsPanel,
  LabShareLinkPanel,
  cancelLabJoin,
  lookupLabById,
  requestLabJoin,
  useAuth,
  type LabLookupResult,
} from "@ilm/ui";

const APP_BASE_URL = import.meta.env.BASE_URL || "/";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const parseJoinLabId = (pathname: string, base: string): string | null => {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const pathBase = pathname.startsWith(normalizedBase) ? pathname.slice(normalizedBase.length) : pathname;
  const segments = pathBase.split("/").filter(Boolean);
  if (segments[0] === "join" && segments[1]) {
    return segments[1];
  }
  return null;
};

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

const AccountDashboard = () => {
  const { profile, user, signOut } = useAuth();
  const signedInLabel = profile?.display_name ?? user?.email ?? "Signed in";
  return (
    <div className="acct-shell">
      <header className="acct-topbar">
        <div>
          <p style={{ margin: 0, color: "#60606b", fontSize: "0.85rem" }}>{signedInLabel}</p>
          <h1>Account & Lab Settings</h1>
        </div>
        <div className="acct-topbar-actions">
          <AppSwitcher currentApp="home" baseUrl={APP_BASE_URL} />
          <button type="button" className="ilm-text-button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>
      <div className="acct-sections">
        <LabSettingsPanel />
        <LabMembersPanel />
        <LabJoinRequestsPanel />
        <LabShareLinkPanel baseUrl={APP_BASE_URL} />
      </div>
    </div>
  );
};

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

  if (status === "signed-out") {
    return <AuthScreen />;
  }

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
            <p className="ilm-auth-note">
              You're already a member of <strong>{labName}</strong>.
            </p>
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

const SignedInShell = () => {
  const { activeLab } = useAuth();
  if (!activeLab) {
    return <LabPicker />;
  }
  return <AccountDashboard />;
};

export const App = () => {
  const { status } = useAuth();
  const joinLabId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return parseJoinLabId(window.location.pathname, APP_BASE_URL);
  }, []);

  if (joinLabId) {
    return <JoinScreen labId={joinLabId} />;
  }

  if (status === "loading") {
    return (
      <div className="ilm-auth-screen">
        <div className="ilm-auth-card">
          <p className="ilm-auth-note">Loading…</p>
        </div>
      </div>
    );
  }

  if (status === "signed-out") {
    return <AuthScreen />;
  }

  return <SignedInShell />;
};

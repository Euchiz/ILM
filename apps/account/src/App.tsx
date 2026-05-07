import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AuthScreen,
  LabPicker,
  LabShell,
  LabTopbar,
  cancelLabJoin,
  lookupLabById,
  requestLabJoin,
  useAuth,
  type LabLookupResult,
  type LabNavId,
} from "@ilm/ui";
import { OverviewView } from "./views/OverviewView";
import { TeamView } from "./views/TeamView";
import { SettingsView } from "./views/SettingsView";
import { PlaceholderView } from "./views/PlaceholderView";

const APP_BASE_URL = import.meta.env.BASE_URL || "/";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

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
// Hash-based routing for internal home views.
// ---------------------------------------------------------------------------

type HomeRoute =
  | { kind: "overview" }
  | { kind: "calendar" }
  | { kind: "team" }
  | { kind: "analytics" }
  | { kind: "reports" }
  | { kind: "settings" };

const ROUTE_HASHES: Record<HomeRoute["kind"], string> = {
  overview: "",
  calendar: "#/calendar",
  team: "#/team",
  analytics: "#/analytics",
  reports: "#/reports",
  settings: "#/settings",
};

const parseHash = (hash: string): HomeRoute => {
  const normalized = hash.replace(/^#\/?/, "");
  switch (normalized) {
    case "calendar":
      return { kind: "calendar" };
    case "team":
      return { kind: "team" };
    case "analytics":
      return { kind: "analytics" };
    case "reports":
      return { kind: "reports" };
    case "settings":
      return { kind: "settings" };
    default:
      return { kind: "overview" };
  }
};

const useHomeRoute = (): HomeRoute => {
  const [route, setRoute] = useState<HomeRoute>(() =>
    typeof window === "undefined" ? { kind: "overview" } : parseHash(window.location.hash)
  );
  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  return route;
};

// ---------------------------------------------------------------------------
// Route → topbar copy + nav-id mapping
// ---------------------------------------------------------------------------

const ROUTE_TITLE: Record<HomeRoute["kind"], string> = {
  overview: "INTEGRATED LAB. INTELLIGENTLY MANAGED.",
  calendar: "CALENDAR",
  team: "TEAM",
  analytics: "ANALYTICS",
  reports: "REPORTS",
  settings: "SETTINGS",
};

const ROUTE_KICKER: Record<HomeRoute["kind"], string> = {
  overview: "OVERVIEW",
  calendar: "CALENDAR",
  team: "TEAM",
  analytics: "ANALYTICS",
  reports: "REPORTS",
  settings: "SETTINGS",
};

const ROUTE_SUBTITLE: Record<HomeRoute["kind"], string> = {
  overview: "Project data. Protocol systems. Resource orchestration.",
  calendar: "Schedule, equipment slots, and review windows.",
  team: "Lab members, invitations, and join requests.",
  analytics: "Cross-app metrics and trends.",
  reports: "Exports, audits, and shareable summaries.",
  settings: "Profile, lab, and workspace configuration.",
};

const ROUTE_NAV: Record<HomeRoute["kind"], LabNavId> = {
  overview: "overview",
  calendar: "calendar",
  team: "team",
  analytics: "analytics",
  reports: "reports",
  settings: "settings",
};

// Suppress unused-import error from earlier route hash table
void ROUTE_HASHES;

const RouteBody = ({
  route,
  onOpenLabPicker,
}: {
  route: HomeRoute;
  onOpenLabPicker: () => void;
}) => {
  switch (route.kind) {
    case "overview":
      return <OverviewView />;
    case "team":
      return <TeamView />;
    case "settings":
      return <SettingsView onOpenLabPicker={onOpenLabPicker} />;
    case "calendar":
      return (
        <PlaceholderView
          title="Calendar"
          blurb="Lab events, equipment booking, and review windows will live here. Currently a future-stage shell."
        />
      );
    case "analytics":
      return (
        <PlaceholderView
          title="Analytics"
          blurb="Cross-app metrics — protocol throughput, project velocity, supply burn — arriving once the underlying apps stabilize."
        />
      );
    case "reports":
      return (
        <PlaceholderView
          title="Reports"
          blurb="Exports and shareable lab summaries. Future-stage feature."
        />
      );
  }
};

const HomeShell = ({ onOpenLabPicker }: { onOpenLabPicker: () => void }) => {
  const route = useHomeRoute();
  return (
    <LabShell
      activeNavId={ROUTE_NAV[route.kind]}
      baseUrl={APP_BASE_URL}
      onOpenProfile={onOpenLabPicker}
      topbar={
        <LabTopbar
          kicker={ROUTE_KICKER[route.kind]}
          title={ROUTE_TITLE[route.kind]}
          subtitle={ROUTE_SUBTITLE[route.kind]}
          baseUrl={APP_BASE_URL}
        />
      }
    >
      <RouteBody route={route} onOpenLabPicker={onOpenLabPicker} />
    </LabShell>
  );
};

// ---------------------------------------------------------------------------
// Join-by-link route (unchanged)
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
          <p className="ilm-auth-error" role="alert">
            {error}
          </p>
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

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

const SignedInShell = () => {
  const { activeLab } = useAuth();
  const [showPicker, setShowPicker] = useState(false);
  const activeLabId = activeLab?.id ?? null;
  const prevIdRef = useRef<string | null>(activeLabId);
  useEffect(() => {
    if (showPicker && activeLabId && activeLabId !== prevIdRef.current) {
      setShowPicker(false);
    }
    prevIdRef.current = activeLabId;
  }, [activeLabId, showPicker]);

  if (!activeLab || showPicker) {
    return <LabPicker onClose={activeLab ? () => setShowPicker(false) : undefined} />;
  }
  return <HomeShell onOpenLabPicker={() => setShowPicker(true)} />;
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

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient } from "@ilm/utils";
import { claimPendingInvitations } from "../admin/api";
import type { LabWithRole, Profile } from "./types";

type AuthStatus = "loading" | "signed-out" | "signed-in";

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  labs: LabWithRole[];
  activeLab: LabWithRole | null;
  error: string | null;

  // Auth actions
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string, redirectTo?: string) => Promise<void>;

  // Lab actions
  selectLab: (labId: string | null) => void;
  createLab: (name: string, slug?: string) => Promise<LabWithRole>;
  refreshLabs: () => Promise<void>;
};

const ACTIVE_LAB_STORAGE_KEY = "ilm.activeLabId";

const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return ctx;
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected error";

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const supabase = useMemo(() => getSupabaseClient(), []);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [labs, setLabs] = useState<LabWithRole[]>([]);
  const [activeLabId, setActiveLabId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_LAB_STORAGE_KEY);
  });
  const [error, setError] = useState<string | null>(null);

  const user = session?.user ?? null;

  // Persist active lab selection
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeLabId) {
      window.localStorage.setItem(ACTIVE_LAB_STORAGE_KEY, activeLabId);
    } else {
      window.localStorage.removeItem(ACTIVE_LAB_STORAGE_KEY);
    }
  }, [activeLabId]);

  const loadProfile = useCallback(
    async (userId: string): Promise<Profile | null> => {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("id, display_name, email")
        .eq("id", userId)
        .maybeSingle();
      if (err) throw err;
      return (data as Profile) ?? null;
    },
    [supabase]
  );

  const loadLabs = useCallback(async (): Promise<LabWithRole[]> => {
    // lab_memberships RLS: only rows for labs the user belongs to
    const { data, error: err } = await supabase
      .from("lab_memberships")
      .select("role, labs:lab_id(id, name, slug, created_by)")
      .order("created_at", { ascending: true });
    if (err) throw err;

    type LabRow = Omit<LabWithRole, "role">;
    type Row = { role: LabWithRole["role"]; labs: LabRow | LabRow[] | null };
    return ((data as unknown as Row[]) ?? [])
      .map((row) => {
        const lab = Array.isArray(row.labs) ? row.labs[0] : row.labs;
        return lab ? { ...lab, role: row.role } : null;
      })
      .filter((row): row is LabWithRole => row !== null);
  }, [supabase]);

  const refreshAll = useCallback(
    async (nextSession: Session | null) => {
      setSession(nextSession);
      if (!nextSession?.user) {
        setProfile(null);
        setLabs([]);
        setStatus("signed-out");
        return;
      }
      try {
        const nextProfile = await loadProfile(nextSession.user.id);
        try {
          await claimPendingInvitations();
        } catch (claimErr) {
          console.warn("[ilm] claim_pending_invitations failed", claimErr);
        }
        const nextLabs = await loadLabs();
        setProfile(nextProfile);
        setLabs(nextLabs);
        setStatus("signed-in");
      } catch (err) {
        setError(errorMessage(err));
        setStatus("signed-in");
      }
    },
    [loadLabs, loadProfile]
  );

  const mountedRef = useRef(false);
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    let cancelled = false;

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      refreshAll(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      refreshAll(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [refreshAll, supabase]);

  // Auto-select lab: if exactly one lab and none selected, pick it. If selected
  // lab is no longer in the list, clear the selection.
  useEffect(() => {
    if (status !== "signed-in") return;
    if (labs.length === 0) {
      if (activeLabId) setActiveLabId(null);
      return;
    }
    if (!activeLabId && labs.length === 1) {
      setActiveLabId(labs[0].id);
      return;
    }
    if (activeLabId && !labs.some((lab) => lab.id === activeLabId)) {
      setActiveLabId(labs.length === 1 ? labs[0].id : null);
    }
  }, [activeLabId, labs, status]);

  const activeLab = useMemo(
    () => labs.find((lab) => lab.id === activeLabId) ?? null,
    [activeLabId, labs]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        throw err;
      }
    },
    [supabase]
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName?: string) => {
      setError(null);
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: displayName ? { data: { display_name: displayName } } : undefined,
      });
      if (err) {
        setError(err.message);
        throw err;
      }
      // Supabase returns a session if email confirmation is disabled; otherwise
      // session is null until confirmation.
      return { needsEmailConfirmation: !data.session };
    },
    [supabase]
  );

  const signOut = useCallback(async () => {
    setError(null);
    const { error: err } = await supabase.auth.signOut();
    if (err) {
      setError(err.message);
      throw err;
    }
    setActiveLabId(null);
  }, [supabase]);

  const sendPasswordReset = useCallback(
    async (email: string, redirectTo?: string) => {
      setError(null);
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectTo ?? (typeof window !== "undefined" ? window.location.href : undefined),
      });
      if (err) {
        setError(err.message);
        throw err;
      }
    },
    [supabase]
  );

  const refreshLabs = useCallback(async () => {
    const next = await loadLabs();
    setLabs(next);
  }, [loadLabs]);

  const createLab = useCallback(
    async (name: string, slug?: string): Promise<LabWithRole> => {
      if (!user) throw new Error("Not signed in");
      setError(null);
      // Under Supabase's new asymmetric-key JWT system, auth.uid() returns
      // NULL inside BEFORE-INSERT triggers and RLS WITH CHECK expressions
      // even when the JWT is verified at the top level, so a direct INSERT
      // on public.labs fails with 42501. The create_lab RPC reads
      // auth.uid() at entry (where it works) and does the insert under
      // SECURITY DEFINER, also creating the owner membership.
      const { data, error: err } = await supabase
        .rpc("create_lab", { p_name: name, p_slug: slug ?? null })
        .maybeSingle();
      if (err) {
        console.error("[ilm] createLab failed", err);
        setError(err.message);
        throw err;
      }
      if (!data) {
        const message = "Lab created, but we couldn't read it back. Try reloading.";
        setError(message);
        throw new Error(message);
      }
      const created: LabWithRole = {
        ...(data as Omit<LabWithRole, "role">),
        role: "owner",
      };
      setLabs((prev) =>
        prev.some((lab) => lab.id === created.id) ? prev : [...prev, created]
      );
      setActiveLabId(created.id);
      return created;
    },
    [loadLabs, supabase, user]
  );

  const selectLab = useCallback((labId: string | null) => {
    setActiveLabId(labId);
  }, []);

  const value: AuthContextValue = {
    status,
    session,
    user,
    profile,
    labs,
    activeLab,
    error,
    signIn,
    signUp,
    signOut,
    sendPasswordReset,
    selectLab,
    createLab,
    refreshLabs,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

type Mode = "sign-in" | "sign-up" | "reset";

const modeLabels: Record<Mode, string> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  reset: "Reset password",
};

export const AuthScreen = () => {
  const { signIn, signUp, sendPasswordReset, error } = useAuth();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setLocalMessage(null);
    setLocalError(null);
    setSubmitting(true);
    try {
      if (mode === "sign-in") {
        await signIn(email.trim(), password);
      } else if (mode === "sign-up") {
        const { needsEmailConfirmation } = await signUp(
          email.trim(),
          password,
          displayName.trim() || undefined
        );
        if (needsEmailConfirmation) {
          setLocalMessage("Check your email to confirm your account before signing in.");
        }
      } else {
        await sendPasswordReset(email.trim());
        setLocalMessage("Password reset email sent. Check your inbox.");
      }
    } catch (err) {
      const message =
        (err && typeof err === "object" && "message" in err &&
          typeof (err as { message?: unknown }).message === "string")
          ? (err as { message: string }).message
          : "Failed";
      setLocalError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="ilm-auth-screen">
      <div className="ilm-auth-card">
        <h1 className="ilm-auth-title">Integrated Lab Manager</h1>
        <nav className="ilm-auth-tabs" aria-label="Auth mode">
          {(["sign-in", "sign-up", "reset"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={`ilm-auth-tab${m === mode ? " ilm-auth-tab-active" : ""}`}
              onClick={() => {
                setMode(m);
                setLocalMessage(null);
                setLocalError(null);
              }}
            >
              {modeLabels[m]}
            </button>
          ))}
        </nav>

        <form onSubmit={handleSubmit} className="ilm-auth-form">
          {mode === "sign-up" && (
            <label className="ilm-auth-field">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                autoComplete="name"
              />
            </label>
          )}

          <label className="ilm-auth-field">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>

          {mode !== "reset" && (
            <label className="ilm-auth-field">
              <span>Password</span>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              />
            </label>
          )}

          <button type="submit" className="ilm-auth-submit" disabled={submitting}>
            {submitting ? "Working…" : modeLabels[mode]}
          </button>

          {(localError || error) && (
            <p className="ilm-auth-error" role="alert">
              {localError ?? error}
            </p>
          )}
          {localMessage && <p className="ilm-auth-note">{localMessage}</p>}
        </form>
      </div>
    </div>
  );
};

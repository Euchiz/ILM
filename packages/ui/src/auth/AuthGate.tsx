import type { PropsWithChildren } from "react";
import { AuthProvider, useAuth } from "./AuthProvider";
import { AuthScreen } from "./AuthScreen";
import { LabPicker } from "./LabPicker";

const AuthGateInner = ({ children }: PropsWithChildren) => {
  const { status, activeLab } = useAuth();

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

  if (!activeLab) {
    return <LabPicker />;
  }

  return <>{children}</>;
};

export const AuthGate = ({ children }: PropsWithChildren) => (
  <AuthProvider>
    <AuthGateInner>{children}</AuthGateInner>
  </AuthProvider>
);

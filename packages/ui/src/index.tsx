import type { PropsWithChildren } from "react";

export const Panel = ({ title, children }: PropsWithChildren<{ title: string }>) => (
  <section style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: 12, background: "#fff" }}>
    <h2 style={{ margin: "0 0 10px", fontSize: 16 }}>{title}</h2>
    {children}
  </section>
);

export const Tag = ({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "info" | "warning" | "success" }) => {
  const colors: Record<string, string> = {
    neutral: "#e2e8f0",
    info: "#dbeafe",
    warning: "#fee2e2",
    success: "#dcfce7"
  };
  return (
    <span style={{ background: colors[tone], borderRadius: 999, padding: "2px 8px", fontSize: 12, fontWeight: 600 }}>
      {label}
    </span>
  );
};

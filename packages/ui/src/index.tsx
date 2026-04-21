import type { PropsWithChildren } from "react";

export * from "./auth";
export { AppSwitcher, type AppId } from "./AppSwitcher";

export const Panel = ({ title, children }: PropsWithChildren<{ title: string }>) => (
  <section className="ilm-panel">
    <h2 className="ilm-panel-title">{title}</h2>
    {children}
  </section>
);

export const Tag = ({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "info" | "warning" | "success" }) => {
  return (
    <span className={`ilm-tag ilm-tag-${tone}`}>
      {label}
    </span>
  );
};

import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  flush?: boolean;
  as?: "section" | "div" | "article";
}

export const Panel = ({ flush, as = "section", className, children, ...rest }: PanelProps) => {
  const Element = as;
  const classes = ["rl-panel", flush ? "rl-panel--flush" : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <Element className={classes} {...rest}>
      {children}
    </Element>
  );
};

export interface SectionHeaderProps {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  titleClassName?: string;
}

export const SectionHeader = ({
  title,
  meta,
  actions,
  className,
  titleClassName,
}: SectionHeaderProps) => {
  const classes = ["rl-section-header", className].filter(Boolean).join(" ");
  const titleClasses = ["rl-section-header__title", titleClassName].filter(Boolean).join(" ");
  return (
    <header className={classes}>
      <h3 className={titleClasses}>{title}</h3>
      {meta ? <span className="rl-section-header__meta">{meta}</span> : null}
      {actions ? <div className="rl-section-header__actions">{actions}</div> : null}
    </header>
  );
};

export const CardGrid = ({ className, children }: PropsWithChildren<{ className?: string }>) => (
  <div className={["rl-card-grid", className].filter(Boolean).join(" ")}>{children}</div>
);

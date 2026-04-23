import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
  ReactNode,
} from "react";

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

// ---------------------------------------------------------------------------
// AppShell — full-viewport grid with optional sidebar and a main column.
// ---------------------------------------------------------------------------

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  sidebar?: ReactNode;
  sidebarAriaLabel?: string;
}

export const AppShell = ({
  sidebar,
  sidebarAriaLabel,
  className,
  children,
  ...rest
}: AppShellProps) => (
  <div
    className={cx("rl-shell", !sidebar && "rl-shell--no-sidebar", className)}
    {...rest}
  >
    {sidebar ? (
      <aside className="rl-shell-sidebar" aria-label={sidebarAriaLabel ?? "Navigation"}>
        {sidebar}
      </aside>
    ) : null}
    <main className="rl-shell-main">{children}</main>
  </div>
);

// ---------------------------------------------------------------------------
// AppTopbar — product name / lab context + action slot (AppSwitcher, etc).
// ---------------------------------------------------------------------------

export interface AppTopbarProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  brand?: ReactNode;
  kicker?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
}

export const AppTopbar = ({
  brand,
  kicker,
  title,
  subtitle,
  actions,
  className,
  children,
  ...rest
}: AppTopbarProps) => {
  const hasCopy = Boolean(kicker || title || subtitle);
  return (
    <header className={cx("rl-topbar", className)} {...rest}>
      {brand ? <div className="rl-topbar__brand">{brand}</div> : null}
      {hasCopy ? (
        <div className="rl-topbar__copy">
          {kicker ? <p className="rl-topbar__kicker">{kicker}</p> : null}
          {title ? <h1 className="rl-topbar__title">{title}</h1> : null}
          {subtitle ? <p className="rl-topbar__subtitle">{subtitle}</p> : null}
        </div>
      ) : null}
      {children}
      {actions ? <div className="rl-topbar__actions">{actions}</div> : null}
    </header>
  );
};

// ---------------------------------------------------------------------------
// AppSubbar — optional secondary bar that holds app-specific tabs / nav.
// ---------------------------------------------------------------------------

export interface AppSubbarProps extends HTMLAttributes<HTMLElement> {
  kicker?: ReactNode;
  description?: ReactNode;
  tabs?: ReactNode;
}

export const AppSubbar = ({
  kicker,
  description,
  tabs,
  className,
  children,
  ...rest
}: AppSubbarProps) => {
  const hasCopy = Boolean(kicker || description);
  return (
    <section className={cx("rl-subbar", className)} {...rest}>
      {hasCopy ? (
        <div className="rl-subbar__copy">
          {kicker ? <p className="rl-subbar__kicker">{kicker}</p> : null}
          {description ? <p className="rl-subbar__description">{description}</p> : null}
        </div>
      ) : null}
      {tabs ? <div className="rl-subbar__tabs">{tabs}</div> : null}
      {children}
    </section>
  );
};

// ---------------------------------------------------------------------------
// AppContent — consistent page container (padding + optional narrow max-width).
// ---------------------------------------------------------------------------

export interface AppContentProps extends HTMLAttributes<HTMLDivElement> {
  narrow?: boolean;
  flush?: boolean;
}

export const AppContent = ({
  narrow,
  flush,
  className,
  children,
  ...rest
}: AppContentProps) => (
  <div
    className={cx(
      "rl-content",
      narrow && "rl-content--narrow",
      flush && "rl-content--flush",
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// AppWordmark — the "Integrated Lab Manager / <Module>" product mark that
// doubles as a home-link button.
// ---------------------------------------------------------------------------

export interface AppWordmarkProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  product: ReactNode;
  module?: ReactNode;
  glyph?: ReactNode;
}

export const AppWordmark = ({
  product,
  module,
  glyph,
  className,
  type = "button",
  ...rest
}: AppWordmarkProps) => (
  <button type={type} className={cx("rl-wordmark", className)} {...rest}>
    {glyph ? (
      <span className="rl-wordmark__glyph" aria-hidden="true">
        {glyph}
      </span>
    ) : null}
    <span className="rl-wordmark__stack">
      <span className="rl-wordmark__product">{product}</span>
      {module ? <span className="rl-wordmark__module">{module}</span> : null}
    </span>
  </button>
);

// ---------------------------------------------------------------------------
// AppSidebarSection — a labelled section inside the shell sidebar.
// ---------------------------------------------------------------------------

export const AppSidebarSection = ({
  title,
  className,
  children,
  ...rest
}: PropsWithChildren<Omit<HTMLAttributes<HTMLElement>, "title"> & { title?: ReactNode }>) => (
  <section className={cx("rl-shell-sidebar__section", className)} {...rest}>
    {title ? <h2 className="rl-shell-sidebar__section-title">{title}</h2> : null}
    {children}
  </section>
);

import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  boxed?: boolean;
}

export const EmptyState = ({
  title,
  description,
  action,
  boxed,
  className,
  children,
  ...rest
}: PropsWithChildren<EmptyStateProps>) => (
  <div
    className={["rl-empty", boxed ? "rl-empty--boxed" : null, className]
      .filter(Boolean)
      .join(" ")}
    {...rest}
  >
    {title ? <h4 className="rl-empty-title">{title}</h4> : null}
    {description ? <p className="rl-empty-description">{description}</p> : null}
    {children}
    {action}
  </div>
);

export interface ErrorBannerProps extends HTMLAttributes<HTMLParagraphElement> {}

export const ErrorBanner = ({
  className,
  children,
  ...rest
}: PropsWithChildren<ErrorBannerProps>) => (
  <p
    role="alert"
    className={["rl-error-banner", className].filter(Boolean).join(" ")}
    {...rest}
  >
    {children}
  </p>
);

export const InlineError = ({
  className,
  children,
  ...rest
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) => (
  <p
    role="alert"
    className={["rl-inline-error", className].filter(Boolean).join(" ")}
    {...rest}
  >
    {children}
  </p>
);

export const InlineNote = ({
  className,
  children,
  ...rest
}: PropsWithChildren<HTMLAttributes<HTMLParagraphElement>>) => (
  <p
    className={["rl-inline-note", className].filter(Boolean).join(" ")}
    {...rest}
  >
    {children}
  </p>
);

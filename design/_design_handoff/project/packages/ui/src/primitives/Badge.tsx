import type { HTMLAttributes, PropsWithChildren } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = ({
  tone = "neutral",
  className,
  children,
  ...rest
}: PropsWithChildren<BadgeProps>) => (
  <span
    className={["rl-badge", `rl-badge--${tone}`, className].filter(Boolean).join(" ")}
    {...rest}
  >
    {children}
  </span>
);

export type StatusTone =
  | "draft"
  | "submitted"
  | "reviewing"
  | "reviewed"
  | "published"
  | "validated"
  | "active"
  | "archived"
  | "rejected"
  | "failed"
  | "blocked"
  | "proposed"
  | "cancelled"
  | "deleted"
  | "neutral";

export interface StatusPillProps extends HTMLAttributes<HTMLSpanElement> {
  status: StatusTone;
  label?: string;
}

export const StatusPill = ({
  status,
  label,
  className,
  children,
  ...rest
}: PropsWithChildren<StatusPillProps>) => (
  <span
    className={["rl-status", `rl-status--${status}`, className].filter(Boolean).join(" ")}
    {...rest}
  >
    {children ?? label ?? status}
  </span>
);

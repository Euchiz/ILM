import type { CSSProperties } from "react";

export type AvatarSize = "sm" | "md" | "lg";

export type AvatarProps = {
  name?: string | null;
  email?: string | null;
  url?: string | null;
  size?: AvatarSize;
  title?: string;
  className?: string;
  style?: CSSProperties;
};

const initialsFor = (name?: string | null, email?: string | null): string => {
  const source = (name && name.trim()) || (email && email.trim()) || "";
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

export const Avatar = ({ name, email, url, size = "md", title, className, style }: AvatarProps) => {
  const label = initialsFor(name, email);
  const tooltip = title ?? name ?? email ?? "";
  const classes = ["rl-avatar", `rl-avatar--${size}`, className].filter(Boolean).join(" ");
  if (url) {
    return (
      <span className={classes} style={style} title={tooltip} aria-label={tooltip || undefined}>
        <img src={url} alt="" className="rl-avatar-img" />
      </span>
    );
  }
  return (
    <span
      className={`${classes} rl-avatar--initials`}
      style={style}
      title={tooltip}
      aria-label={tooltip || undefined}
    >
      {label}
    </span>
  );
};

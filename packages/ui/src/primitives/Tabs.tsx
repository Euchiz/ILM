import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  items: readonly TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  plain?: boolean;
  className?: string;
  right?: ReactNode;
}

export const Tabs = <T extends string = string>({
  items,
  activeId,
  onChange,
  plain,
  className,
  right,
}: TabsProps<T>) => {
  const classes = ["rl-tabs", plain ? "rl-tabs--plain" : null, className]
    .filter(Boolean)
    .join(" ");
  return (
    <div role="tablist" className={classes}>
      {items.map((item) => (
        <button
          key={item.id}
          role="tab"
          type="button"
          disabled={item.disabled}
          aria-selected={item.id === activeId}
          className="rl-tab"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
      {right ? <div className="rl-tabs-right">{right}</div> : null}
    </div>
  );
};

export interface TabButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export const TabButton = ({ active, className, type = "button", ...rest }: TabButtonProps) => (
  <button
    type={type}
    className={["rl-tab", active ? "is-active" : null, className].filter(Boolean).join(" ")}
    aria-selected={active}
    role="tab"
    {...rest}
  />
);

export const TabPanel = ({
  children,
  className,
  ...rest
}: PropsWithChildren<{ className?: string } & React.HTMLAttributes<HTMLDivElement>>) => (
  <div
    role="tabpanel"
    className={["rl-tab-panel", className].filter(Boolean).join(" ")}
    {...rest}
  >
    {children}
  </div>
);

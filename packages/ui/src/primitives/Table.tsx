import type { PropsWithChildren, TableHTMLAttributes } from "react";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {}

export const Table = ({ className, children, ...rest }: TableProps) => (
  <table className={["rl-table", className].filter(Boolean).join(" ")} {...rest}>
    {children}
  </table>
);

export const TableEmpty = ({
  children,
  colSpan,
}: PropsWithChildren<{ colSpan: number }>) => (
  <tr>
    <td colSpan={colSpan} className="rl-table-empty">
      {children}
    </td>
  </tr>
);

export const TableLoading = ({
  colSpan,
  label = "Loading…",
}: {
  colSpan: number;
  label?: string;
}) => (
  <tr>
    <td colSpan={colSpan} className="rl-table-loading">
      {label}
    </td>
  </tr>
);

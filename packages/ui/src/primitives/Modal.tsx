import { useEffect, type MouseEvent, type PropsWithChildren, type ReactNode } from "react";
import { Button } from "./Button";

export type ModalWidth = "narrow" | "default" | "wide";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  note?: ReactNode;
  actions?: ReactNode;
  width?: ModalWidth;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  className?: string;
  labelledBy?: string;
}

export const Modal = ({
  open,
  onClose,
  title,
  note,
  actions,
  width = "default",
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
  labelledBy,
  children,
}: PropsWithChildren<ModalProps>) => {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  const handleBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (!closeOnBackdrop) return;
    if (event.target === event.currentTarget) onClose();
  };

  const widthClass =
    width === "wide" ? "rl-modal--wide" : width === "narrow" ? "rl-modal--narrow" : null;

  return (
    <div className="rl-modal-backdrop" onMouseDown={handleBackdrop}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={["rl-modal", widthClass, className].filter(Boolean).join(" ")}
      >
        {title ? (
          <header className="rl-modal-head">
            <h2 id={labelledBy}>{title}</h2>
            <button type="button" className="rl-modal-close" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </header>
        ) : null}
        {note ? <p className="rl-modal-note">{note}</p> : null}
        {children}
        {actions ? <div className="rl-modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: ReactNode;
  cancelLabel?: ReactNode;
  tone?: "primary" | "danger";
  busy?: boolean;
}

export const ConfirmDialog = ({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary",
  busy,
}: ConfirmDialogProps) => (
  <Modal
    open={open}
    onClose={onClose}
    title={title}
    width="narrow"
    actions={
      <>
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          onClick={() => void onConfirm()}
          disabled={busy}
        >
          {confirmLabel}
        </Button>
      </>
    }
  >
    {description ? <p className="rl-modal-note">{description}</p> : null}
  </Modal>
);

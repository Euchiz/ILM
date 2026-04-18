import { useState } from "react";
import {
  FloatingFocusManager,
  FloatingPortal,
  offset,
  flip,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole
} from "@floating-ui/react";

export interface ActionMenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
}

interface ActionMenuProps {
  label: string;
  items: ActionMenuItem[];
  buttonClassName?: string;
}

export const ActionMenu = ({ label, items, buttonClassName }: ActionMenuProps) => {
  const [open, setOpen] = useState(false);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-end",
    middleware: [offset(8), flip(), shift({ padding: 12 })]
  });

  const click = useClick(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: "menu" });
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role]);

  return (
    <>
      <button
        aria-label={label}
        className={buttonClassName ?? "menu-trigger"}
        ref={refs.setReference}
        type="button"
        {...getReferenceProps()}
      >
        {label}
      </button>
      {open ? (
        <FloatingPortal>
          <FloatingFocusManager context={context} modal={false}>
            <div className="action-menu" ref={refs.setFloating} style={floatingStyles} {...getFloatingProps()}>
              {items.map((item) => (
                <button
                  className={item.tone === "danger" ? "action-menu-item danger" : "action-menu-item"}
                  key={item.label}
                  onClick={() => {
                    item.onSelect();
                    setOpen(false);
                  }}
                  disabled={item.disabled}
                  role="menuitem"
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </FloatingFocusManager>
        </FloatingPortal>
      ) : null}
    </>
  );
};

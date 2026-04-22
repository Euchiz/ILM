import { useEffect, useMemo, useState } from "react";

export type SubmissionHistoryEntry = {
  type: "submitted" | "approved" | "rejected" | string;
  actor?: string | null;
  at?: string | null;
  comment?: string | null;
};

interface Props {
  history: SubmissionHistoryEntry[] | null | undefined;
  /** Map of user_id → display name, used when actor is a UUID. */
  actorNames?: Map<string, string>;
  /** Shown in the drawer header. */
  title?: string;
  /** Label for the trigger link; default "Submission history". */
  linkLabel?: string;
  /** When false, renders nothing. Use to gate on draft state. */
  visible?: boolean;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const eventLabel: Record<string, string> = {
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

export const SubmissionHistoryLink = ({
  history,
  actorNames,
  title = "Submission history",
  linkLabel = "Submission history",
  visible = true,
}: Props) => {
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => history ?? [], [history]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!visible) return null;

  const resolveActor = (actor?: string | null) => {
    if (!actor) return "Unknown";
    return actorNames?.get(actor) ?? actor.slice(0, 8);
  };

  const countLabel = entries.length === 0 ? "empty" : String(entries.length);

  return (
    <>
      <button
        type="button"
        className="ilm-history-link"
        onClick={() => setOpen(true)}
        title="View submission history"
      >
        {linkLabel} ({countLabel})
      </button>
      {open ? (
        <div className="ilm-history-backdrop" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="ilm-history-sheet" onClick={(event) => event.stopPropagation()}>
            <header className="ilm-history-head">
              <h3>{title}</h3>
              <button type="button" className="ilm-text-button" onClick={() => setOpen(false)}>
                Close
              </button>
            </header>
            {entries.length === 0 ? (
              <p className="ilm-history-empty">No submissions yet. The draft has not been submitted.</p>
            ) : (
              <ol className="ilm-history-log">
                {entries.map((entry, index) => (
                  <li key={index} className={`ilm-history-entry ilm-history-entry-${entry.type}`}>
                    <div className="ilm-history-entry-head">
                      <strong>{eventLabel[entry.type] ?? entry.type}</strong>
                      <span>{formatDate(entry.at)}</span>
                      <span className="ilm-history-actor">{resolveActor(entry.actor)}</span>
                    </div>
                    {entry.comment ? <p className="ilm-history-comment">{entry.comment}</p> : (
                      <p className="ilm-history-comment ilm-history-no-comment">(no comment)</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
};

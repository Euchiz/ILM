import { useCallback, useEffect, useState } from "react";
import {
  approveSubmission,
  listSubmissions,
  rejectSubmission,
  withdrawSubmission,
  type CloudSubmissionRow,
} from "../lib/cloudAdapter";

interface SubmissionsPanelProps {
  labId: string;
  currentUserId: string | null;
  /** Project ids where the current user is a lead (or where they're a
   *  lab admin — callers should union the sets). Used to show the
   *  approve/reject buttons only where appropriate. */
  leadProjectIds: Set<string>;
  onPublished: () => void;
}

type StatusFilter = "pending" | "all";

const STATUS_LABEL: Record<CloudSubmissionRow["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const SubmissionsPanel = ({
  labId,
  currentUserId,
  leadProjectIds,
  onPublished,
}: SubmissionsPanelProps) => {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [rows, setRows] = useState<CloudSubmissionRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [commentFor, setCommentFor] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const statuses =
        filter === "pending"
          ? (["pending"] as const)
          : (["pending", "approved", "rejected", "withdrawn"] as const);
      setRows(await listSubmissions(labId, [...statuses]));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter, labId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (row: CloudSubmissionRow, action: "approve" | "reject" | "withdraw", comment?: string) => {
    setBusyId(row.id);
    setError(null);
    try {
      if (action === "approve") {
        await approveSubmission(row.id, comment);
        onPublished();
      } else if (action === "reject") {
        await rejectSubmission(row.id, comment);
      } else {
        await withdrawSubmission(row.id);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
      setCommentFor(null);
      setCommentText("");
    }
  };

  return (
    <div className="ilm-submissions-panel">
      <header className="ilm-submissions-header">
        <h3>Review submissions</h3>
        <div className="ilm-submissions-filter">
          <label>
            <input
              type="radio"
              name="subs-filter"
              checked={filter === "pending"}
              onChange={() => setFilter("pending")}
            />
            Pending
          </label>
          <label>
            <input
              type="radio"
              name="subs-filter"
              checked={filter === "all"}
              onChange={() => setFilter("all")}
            />
            All
          </label>
          <button type="button" className="ilm-text-button" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
        </div>
      </header>

      {error && <p className="ilm-auth-error">{error}</p>}
      {loading && <p className="helper-text">Loading…</p>}
      {!loading && rows.length === 0 && <p className="helper-text">No submissions.</p>}

      <ul className="ilm-submissions-list">
        {rows.map((row) => {
          const title = row.document_json?.protocol?.title || "(untitled)";
          const canReview = leadProjectIds.has(row.project_id);
          const isSubmitter = row.submitter_id === currentUserId;
          const pending = row.status === "pending";
          const busy = busyId === row.id;
          const showingComment = commentFor === row.id;

          return (
            <li key={row.id} className="ilm-submissions-item">
              <div className="ilm-submissions-item-head">
                <div>
                  <div className="ilm-submissions-title">{title}</div>
                  <div className="helper-text">
                    {STATUS_LABEL[row.status]}
                    {" · "}
                    submitted {new Date(row.submitted_at).toLocaleString()}
                    {row.reviewed_at && ` · reviewed ${new Date(row.reviewed_at).toLocaleString()}`}
                  </div>
                </div>
              </div>
              {row.review_comment && (
                <div className="ilm-submissions-comment">
                  <em>Reviewer note:</em> {row.review_comment}
                </div>
              )}

              {pending && (canReview || isSubmitter) && (
                <div className="ilm-submissions-actions">
                  {canReview && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setCommentFor(showingComment ? null : row.id)}
                      >
                        {showingComment ? "Hide comment" : "Review"}
                      </button>
                    </>
                  )}
                  {isSubmitter && (
                    <button
                      type="button"
                      className="ilm-text-button"
                      disabled={busy}
                      onClick={() => void runAction(row, "withdraw")}
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              )}

              {showingComment && canReview && pending && (
                <div className="ilm-submissions-review">
                  <textarea
                    value={commentText}
                    onChange={(event) => setCommentText(event.target.value)}
                    placeholder="Optional comment"
                    rows={3}
                  />
                  <div className="ilm-submissions-review-buttons">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(row, "approve", commentText.trim() || undefined)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(row, "reject", commentText.trim() || undefined)}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

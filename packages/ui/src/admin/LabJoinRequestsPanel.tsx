import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  approveLabJoin,
  listLabJoinRequests,
  rejectLabJoin,
  type LabJoinRequestRecord,
} from "./api";

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Unexpected error");

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));

export const LabJoinRequestsPanel = ({ title = "Join Requests" }: { title?: string }) => {
  const { activeLab, refreshLabs } = useAuth();
  const labId = activeLab?.id ?? null;
  const canManage = activeLab?.role === "owner" || activeLab?.role === "admin";
  const [requests, setRequests] = useState<LabJoinRequestRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!labId || !canManage) {
      setRequests([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRequests(await listLabJoinRequests(labId, "pending"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canManage, labId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleApprove = async (request: LabJoinRequestRecord) => {
    setBusyRequestId(request.id);
    setError(null);
    try {
      await approveLabJoin(request.id);
      await load();
      await refreshLabs();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  const openReject = (request: LabJoinRequestRecord) => {
    setRejectOpen(request.id);
    setRejectComment("");
  };

  const handleReject = async (request: LabJoinRequestRecord) => {
    const comment = rejectComment.trim();
    if (!comment) {
      setError("A comment is required to reject a request.");
      return;
    }
    setBusyRequestId(request.id);
    setError(null);
    try {
      await rejectLabJoin(request.id, comment);
      setRejectOpen(null);
      setRejectComment("");
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusyRequestId(null);
    }
  };

  if (!canManage) return null;

  return (
    <section className="ilm-admin-card">
      <div className="ilm-admin-header">
        <div>
          <h2>{title}</h2>
          <p className="ilm-auth-note">
            Approve or reject people who asked to join via the lab's share link.
          </p>
        </div>
        <span className="ilm-admin-pill">{requests.length} pending</span>
      </div>

      {error ? <p className="ilm-auth-error">{error}</p> : null}

      {loading ? (
        <p className="ilm-admin-empty">Loading join requests…</p>
      ) : requests.length === 0 ? (
        <p className="ilm-admin-empty">No pending join requests.</p>
      ) : (
        <ul className="ilm-admin-list">
          {requests.map((request) => {
            const busy = busyRequestId === request.id;
            const label = request.display_name || request.email || request.user_id;
            const rejecting = rejectOpen === request.id;
            return (
              <li className="ilm-admin-list-item" key={request.id}>
                <div className="ilm-admin-list-copy">
                  <strong>{label}</strong>
                  <span>{request.email || "No email available"}</span>
                  <small>Requested {formatDate(request.created_at)}</small>
                  {request.message ? (
                    <p className="ilm-admin-helper" style={{ marginTop: "0.4rem" }}>
                      “{request.message}”
                    </p>
                  ) : null}
                </div>
                <div className="ilm-admin-actions">
                  {rejecting ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", minWidth: "14rem" }}>
                      <textarea
                        value={rejectComment}
                        onChange={(event) => setRejectComment(event.target.value)}
                        placeholder="Reason (required)"
                        rows={2}
                      />
                      <div style={{ display: "flex", gap: "0.4rem" }}>
                        <button
                          type="button"
                          className="ilm-text-button"
                          disabled={busy}
                          onClick={() => void handleReject(request)}
                        >
                          Confirm reject
                        </button>
                        <button
                          type="button"
                          className="ilm-text-button"
                          disabled={busy}
                          onClick={() => {
                            setRejectOpen(null);
                            setRejectComment("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="ilm-text-button"
                        disabled={busy}
                        onClick={() => void handleApprove(request)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="ilm-text-button"
                        disabled={busy}
                        onClick={() => openReject(request)}
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

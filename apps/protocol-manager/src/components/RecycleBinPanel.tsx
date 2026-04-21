import { useCallback, useEffect, useState } from "react";
import {
  listDeletedProtocols,
  permanentDeleteProtocol,
  restoreProtocol,
  type CloudProtocolRow,
} from "../lib/cloudAdapter";

interface RecycleBinPanelProps {
  labId: string;
  onChanged: () => void;
}

const daysLeft = (deletedAt: string): number => {
  const deleted = new Date(deletedAt).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil(30 - (now - deleted) / (24 * 60 * 60 * 1000)));
};

export const RecycleBinPanel = ({ labId, onChanged }: RecycleBinPanelProps) => {
  const [rows, setRows] = useState<CloudProtocolRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listDeletedProtocols(labId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runAction = async (row: CloudProtocolRow, action: "restore" | "purge") => {
    setBusyId(row.id);
    setError(null);
    try {
      if (action === "restore") {
        await restoreProtocol(row.id);
      } else {
        if (!window.confirm(`Permanently delete "${row.title}"? This cannot be undone.`)) return;
        await permanentDeleteProtocol(row.id);
      }
      onChanged();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="ilm-recycle-bin">
      <header className="ilm-recycle-bin-header">
        <h3>Recycle bin</h3>
        <p className="helper-text">
          Deleted protocols stay here for 30 days. After that they're purged automatically.
        </p>
        <button type="button" className="ilm-text-button" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </button>
      </header>
      {error && <p className="ilm-auth-error">{error}</p>}
      {loading && <p className="helper-text">Loading…</p>}
      {!loading && rows.length === 0 && <p className="helper-text">The bin is empty.</p>}
      <ul className="ilm-recycle-bin-list">
        {rows.map((row) => {
          const busy = busyId === row.id;
          const remaining = row.deleted_at ? daysLeft(row.deleted_at) : 0;
          return (
            <li key={row.id} className="ilm-recycle-bin-item">
              <div>
                <div className="ilm-recycle-bin-title">{row.title || "(untitled)"}</div>
                <div className="helper-text">
                  Deleted {row.deleted_at ? new Date(row.deleted_at).toLocaleString() : "—"}
                  {" · "}
                  {remaining} day{remaining === 1 ? "" : "s"} until automatic purge
                </div>
              </div>
              <div className="ilm-recycle-bin-actions">
                <button type="button" disabled={busy} onClick={() => void runAction(row, "restore")}>
                  Restore
                </button>
                <button type="button" className="ilm-text-button" disabled={busy} onClick={() => void runAction(row, "purge")}>
                  Delete permanently
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

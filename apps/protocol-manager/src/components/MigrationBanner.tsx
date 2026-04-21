import { useEffect, useMemo, useState } from "react";
import type { ProtocolDocument } from "@ilm/types";
import { safeJsonParse } from "@ilm/utils";
import { saveDraft, submitDraft, type CloudProtocolRow } from "../lib/cloudAdapter";
import {
  ensureProtocolMetadata,
  LIBRARY_STORAGE_KEY,
  type ProtocolLibraryState,
} from "../lib/protocolLibrary";

interface MigrationBannerProps {
  labId: string | null;
  labName: string | null;
  generalProjectId: string | null;
  cloudProtocols: CloudProtocolRow[];
  onUploaded: () => void;
}

/**
 * Offers a one-click upload of anything stored in the legacy
 * localStorage library that isn't already in the cloud for the active
 * lab. Matching is done by the client-side protocol id (document.protocol.id)
 * which is preserved on import/export, so repeat visits don't re-upload.
 *
 * Uploaded protocols are saved as drafts against the General project and
 * then submitted. Because General has approval_required=false, this
 * publishes immediately. Users who want review-gated behaviour can move
 * them to another project afterwards.
 */
export const MigrationBanner = ({
  labId,
  labName,
  generalProjectId,
  cloudProtocols,
  onUploaded,
}: MigrationBannerProps) => {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localProtocols = useMemo<ProtocolDocument[]>(() => {
    if (typeof window === "undefined") return [];
    const raw = window.localStorage.getItem(LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = safeJsonParse<ProtocolLibraryState>(raw);
    if (!parsed.ok || !parsed.value.protocols.length) return [];
    return parsed.value.protocols;
  }, []);

  const cloudIds = useMemo(
    () => new Set(cloudProtocols.map((row) => row.document_json?.protocol?.id).filter(Boolean) as string[]),
    [cloudProtocols]
  );

  const pending = useMemo(
    () => localProtocols.filter((doc) => !cloudIds.has(doc.protocol.id)),
    [localProtocols, cloudIds]
  );

  if (dismissed || !labId || pending.length === 0) return null;

  const handleUpload = async () => {
    if (!generalProjectId) {
      setError("No General project available in this lab — can't upload.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const doc of pending) {
        const normalized = ensureProtocolMetadata(doc);
        const draftId = await saveDraft({
          protocolId: null,
          projectId: generalProjectId,
          document: normalized,
        });
        await submitDraft(draftId);
      }
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(LIBRARY_STORAGE_KEY);
      }
      onUploaded();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ilm-migration-banner" role="status">
      <div>
        <strong>
          {pending.length} protocol{pending.length === 1 ? "" : "s"} from this browser aren't in the cloud yet
        </strong>
        <span className="helper-text">
          {" "}Upload into <em>{labName ?? "the current lab"}</em>'s General project?
        </span>
        {error && <div className="ilm-migration-banner-error">{error}</div>}
      </div>
      <div className="ilm-migration-banner-actions">
        <button type="button" disabled={busy} onClick={handleUpload}>
          {busy ? "Uploading…" : "Upload"}
        </button>
        <button type="button" className="ilm-text-button" disabled={busy} onClick={() => setDismissed(true)}>
          Not now
        </button>
      </div>
    </div>
  );
};

/**
 * Effect-safe helper other components can use to react when the library
 * storage key changes (e.g. after a successful upload we want to refresh
 * the rest of the app's derived state).
 */
export const useLibraryStorageListener = (callback: () => void) => {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: StorageEvent) => {
      if (event.key === LIBRARY_STORAGE_KEY) callback();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, [callback]);
};

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "@/components";

export const DiagnosticsPanel = () => {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const status = await invoke<{ enabled: boolean }>("diagnostics_status");
        if (!disposed) setEnabled(status.enabled);
      } catch {}
    };
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => { disposed = true; clearInterval(timer); };
  }, []);
  const toggle = async () => {
    setBusy(true);
    setError("");
    try {
      await invoke(enabled ? "diagnostics_stop" : "diagnostics_start");
      const status = await invoke<{ enabled: boolean }>("diagnostics_status");
      setEnabled(status.enabled);
    } catch { setError("Could not change local diagnostics. Restart the app and try again."); }
    finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-border/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium">Local diagnostics: {enabled ? "On" : "Off"}</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={toggle} className="text-xs">
          {enabled ? "Stop diagnostics" : "Enable diagnostics"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {enabled ? "Available on this computer for 30 minutes. " : "Enable live troubleshooting on this computer. "}
        Shares signal levels and STT status codes. Audio, transcripts and API keys are excluded.
      </p>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
};

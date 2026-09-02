import { useEffect, useState } from "react";
import { retryPrivateStorage } from "@/lib/storage/private-storage";

export function StorageStatus() {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const error = () => setFailed(true);
    const saved = () => setFailed(false);
    window.addEventListener("private-storage-error", error);
    window.addEventListener("private-storage-saved", saved);
    return () => {
      window.removeEventListener("private-storage-error", error);
      window.removeEventListener("private-storage-saved", saved);
    };
  }, []);
  if (!failed) return null;
  return <div role="alert" className="fixed top-0 left-0 right-0 z-50 bg-red-950 text-white p-2 text-sm">
    Provider settings could not be saved. Keep this window open.
    <button className="underline ml-2" onClick={() => { retryPrivateStorage().catch(() => setFailed(true)); }}>Retry</button>
  </div>;
}

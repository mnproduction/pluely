import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export const PRIVATE_KEYS = new Set([
  "curl_custom_ai_providers", "curl_custom_speech_providers",
  "curl_selected_ai_provider", "curl_selected_stt_provider",
]);
let values: Record<string, string> = {};
const dirty = new Map<string, { value: string | null; version: number }>();
let version = 0;
let ready = false;
let pending = Promise.resolve();
let lastError: unknown;

function fail(error: unknown) {
  lastError = error;
  window.dispatchEvent(new Event("private-storage-error"));
}
function apply(key: string, value: string | null) {
  if (value === null) delete values[key];
  else values[key] = value;
}
async function refresh() {
  values = await invoke<Record<string, string>>("private_store_load");
  // A read racing with typing must not overwrite newer unsaved input.
  for (const [key, entry] of dirty) apply(key, entry.value);
}

export async function initializePrivateStorage(): Promise<void> {
  await listen<string>("private-store-changed", ({ payload: key }) => {
    pending = pending.then(async () => {
      await refresh();
      window.dispatchEvent(new StorageEvent("storage", { key }));
    }).catch(fail);
  });
  await refresh();
  // Only migrate this app's own storage. Never read another app's directory.
  // Plaintext is deleted only after a successful native write.
  for (const key of PRIVATE_KEYS) {
    const old = localStorage.getItem(key);
    if (old !== null) {
      if (!(key in values)) {
        await invoke("private_store_set", { key, value: old });
        values[key] = old;
      }
      localStorage.removeItem(key);
    }
  }
  ready = true;
}

export function getPrivate(key: string): string | null {
  if (!ready) throw new Error("Provider storage is not ready");
  return values[key] ?? null;
}

function enqueue(key: string, entry: { value: string | null; version: number }) {
  pending = pending.then(async () => {
    await invoke("private_store_set", { key, value: entry.value });
    if (dirty.get(key)?.version === entry.version) dirty.delete(key);
    if (!dirty.size) {
      lastError = undefined;
      window.dispatchEvent(new Event("private-storage-saved"));
    }
  }).catch(fail);
}

export function setPrivate(key: string, value: string | null): void {
  if (!ready) throw new Error("Provider storage is not ready");
  if ((values[key] ?? null) === value && !lastError) return;
  apply(key, value);
  const entry = { value, version: ++version };
  dirty.set(key, entry);
  enqueue(key, entry);
}

export async function flushPrivateStorage(): Promise<void> {
  await pending;
  if (lastError || dirty.size) throw new Error("Provider settings could not be saved.");
}

export async function retryPrivateStorage(): Promise<void> {
  for (const [key, entry] of dirty) enqueue(key, entry);
  await flushPrivateStorage();
}

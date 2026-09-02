import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
let disk: Record<string, string>;
let local: Map<string, string>;
const key = "curl_selected_ai_provider";

beforeEach(() => {
  vi.resetModules();
  mocks.invoke.mockReset();
  mocks.listen.mockReset().mockResolvedValue(() => {});
  disk = {};
  local = new Map();
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("StorageEvent", class extends Event {
    key: string;
    constructor(name: string, init: { key: string }) { super(name); this.key = init.key; }
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: vi.fn((k: string, v: string) => local.set(k, v)),
    removeItem: vi.fn((k: string) => local.delete(k)),
  });
  mocks.invoke.mockImplementation(async (command, args) => {
    if (command === "private_store_load") return { ...disk };
    if (command === "private_store_set") {
      if (args.value === null) delete disk[args.key]; else disk[args.key] = args.value;
      return;
    }
    throw new Error("Unexpected command");
  });
});

it("persists provider keys through native storage and never puts them in localStorage", async () => {
  const vault = await import("../src/lib/storage/private-storage");
  const { safeLocalStorage } = await import("../src/lib/storage/helper");
  await vault.initializePrivateStorage();
  safeLocalStorage.setItem(key, "fake-secret");
  await vault.flushPrivateStorage();
  expect(disk[key]).toBe("fake-secret");
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(safeLocalStorage.getItem(key)).toBe("fake-secret");
  safeLocalStorage.removeItem(key);
  await vault.flushPrivateStorage();
  expect(disk[key]).toBeUndefined();
});

it("preserves the old plaintext record if native migration fails", async () => {
  local.set(key, "fake-migration-secret");
  mocks.invoke.mockImplementation(async (command) => {
    if (command === "private_store_load") return {};
    throw new Error("Disk unavailable");
  });
  const vault = await import("../src/lib/storage/private-storage");
  await expect(vault.initializePrivateStorage()).rejects.toThrow();
  expect(localStorage.removeItem).not.toHaveBeenCalled();
  expect(local.get(key)).toBe("fake-migration-secret");
});

it("deletes a migrated plaintext record only after the native write succeeds", async () => {
  local.set(key, "fake-migration-secret");
  const vault = await import("../src/lib/storage/private-storage");
  await vault.initializePrivateStorage();
  expect(disk[key]).toBe("fake-migration-secret");
  expect(local.has(key)).toBe(false);
});

it("surfaces a failed save, retains input in memory, and allows retry without plaintext fallback", async () => {
  const vault = await import("../src/lib/storage/private-storage");
  await vault.initializePrivateStorage();
  const errors = vi.fn();
  window.addEventListener("private-storage-error", errors);
  mocks.invoke.mockRejectedValueOnce(new Error("Disk full"));
  vault.setPrivate(key, "fake-unsaved-secret");
  await expect(vault.flushPrivateStorage()).rejects.toThrow();
  expect(errors).toHaveBeenCalledOnce();
  expect(vault.getPrivate(key)).toBe("fake-unsaved-secret");
  expect(localStorage.setItem).not.toHaveBeenCalled();
  await vault.retryPrivateStorage();
  expect(disk[key]).toBe("fake-unsaved-secret");
});

it("refreshes another window without overwriting newer input that is still pending", async () => {
  const vault = await import("../src/lib/storage/private-storage");
  await vault.initializePrivateStorage();
  const onChange = mocks.listen.mock.calls[0][1];
  disk[key] = "old-value";
  onChange({ payload: key });
  vault.setPrivate(key, "new-value");
  await vault.flushPrivateStorage();
  expect(vault.getPrivate(key)).toBe("new-value");
  expect(disk[key]).toBe("new-value");
});

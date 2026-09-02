// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "../src/config";
import { AppProvider, useApp } from "../src/contexts/app.context";
import { AppIconToggle } from "../src/pages/settings/components/AppIconToggle";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  events: new Map<string, () => Promise<void>>(),
  label: "main",
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: () => ({ label: mocks.label }) }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, callback: () => Promise<void>) => {
    mocks.events.set(name, callback);
    return () => mocks.events.delete(name);
  },
}));
vi.mock("@tauri-apps/plugin-autostart", () => ({ enable: vi.fn(), disable: vi.fn() }));
vi.mock("@/lib", () => ({
  getPlatform: () => "windows",
  safeLocalStorage: {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
  },
}));
vi.mock("@/lib/storage", () => import("../src/lib/storage/customizable.storage"));
vi.mock("@/contexts", () => import("../src/contexts/app.context"));
vi.mock("@/components", () => ({
  Header: () => null,
  Label: ({ children }: { children: unknown }) => children,
  Switch: ({ checked, onCheckedChange, disabled, "aria-label": label }: any) =>
    createElement("button", {
      role: "switch", "aria-checked": checked, "aria-label": label, disabled,
      onClick: () => onCheckedChange(!checked),
    }),
}));

let root: Root;
let container: HTMLDivElement;
let context: ReturnType<typeof useApp>;
function Harness() {
  context = useApp();
  return createElement(AppIconToggle);
}
function savePreference(visible: boolean) {
  localStorage.setItem(STORAGE_KEYS.CUSTOMIZABLE, JSON.stringify({ appIcon: { isVisible: visible } }));
}
async function mount() {
  container = document.createElement("div");
  root = createRoot(container);
  await act(async () => root.render(createElement(AppProvider, { children: createElement(Harness) })));
}
const iconCalls = () => mocks.invoke.mock.calls.filter(([name]) => name === "set_app_icon_visibility");

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  mocks.invoke.mockReset().mockResolvedValue(undefined);
  mocks.events.clear();
  mocks.label = "main";
});
afterEach(async () => { await act(async () => root?.unmount()); });

it("applies the saved hidden preference without briefly showing icons at startup", async () => {
  savePreference(false);
  await mount();
  expect(iconCalls().length).toBeGreaterThan(0);
  expect(iconCalls().every(([, args]) => args.visible === false)).toBe(true);
});

it("turning Hide icon on hides the app and turning it off restores it", async () => {
  await mount();
  const toggle = container.querySelector<HTMLButtonElement>("[role=switch]")!;
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  await act(async () => toggle.click());
  expect(context.customizable.appIcon.isVisible).toBe(false);
  expect(iconCalls().at(-1)?.[1]).toEqual({ visible: false });
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle.click());
  expect(context.customizable.appIcon.isVisible).toBe(true);
  expect(iconCalls().at(-1)?.[1]).toEqual({ visible: true });
});

it("showing a window does not override the hidden preference", async () => {
  savePreference(false);
  await mount();
  mocks.invoke.mockClear();
  await act(async () => { await mocks.events.get("handle-app-icon-on-show")?.(); });
  expect(iconCalls().some(([, args]) => args.visible === true)).toBe(false);
});

it("a newly mounted dashboard uses the same hidden preference", async () => {
  savePreference(false);
  await mount();
  await act(async () => root.unmount());
  mocks.label = "dashboard";
  mocks.invoke.mockClear();
  await mount();
  expect(iconCalls().every(([, args]) => args.visible === false)).toBe(true);
});

it("syncs a preference changed in another window", async () => {
  await mount();
  mocks.invoke.mockClear();
  savePreference(false);
  await act(async () => {
    window.dispatchEvent(new StorageEvent("storage", {
      key: STORAGE_KEYS.CUSTOMIZABLE,
      newValue: localStorage.getItem(STORAGE_KEYS.CUSTOMIZABLE),
    }));
  });
  expect(context.customizable.appIcon.isVisible).toBe(false);
  expect(iconCalls().at(-1)?.[1]).toEqual({ visible: false });
});

it("shows a native failure without saving a setting that was not applied", async () => {
  await mount();
  mocks.invoke.mockRejectedValueOnce(new Error("Taskbar update failed"));
  await act(async () => container.querySelector<HTMLButtonElement>("[role=switch]")!.click());
  expect(context.customizable.appIcon.isVisible).toBe(true);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOMIZABLE)!).appIcon.isVisible).toBe(true);
  expect(container.querySelector("[role=alert]")?.textContent).toContain("Taskbar update failed");
});

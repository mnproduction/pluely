// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSystemAudio } from "../src/hooks/useSystemAudio";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listeners: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  shortcuts: { registerSystemAudioCallback: vi.fn() },
  resizeWindow: vi.fn(),
  context: {
    selectedSttProvider: { provider: "test-stt" },
    allSttProviders: [{ id: "test-stt" }],
    selectedAIProvider: { provider: "test-ai" },
    allAiProviders: [{ id: "test-ai" }],
    systemPrompt: "Test",
    selectedAudioDevices: { output: { id: "default" } },
  },
  fetchSTT: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
    const callbacks = mocks.listeners.get(name) ?? new Set();
    callbacks.add(callback);
    mocks.listeners.set(name, callbacks);
    return () => callbacks.delete(callback);
  },
}));
vi.mock("../src/hooks", () => ({
  useWindowResize: () => ({ resizeWindow: mocks.resizeWindow }),
  useGlobalShortcuts: () => mocks.shortcuts,
}));
vi.mock("@/contexts", () => ({ useApp: () => mocks.context }));
vi.mock("@/lib/functions", () => ({ fetchSTT: mocks.fetchSTT, fetchAIResponse: vi.fn() }));
vi.mock("@/lib", () => ({
  safeLocalStorage: {
    getItem: (key: string) => localStorage.getItem(key),
    setItem: (key: string, value: string) => localStorage.setItem(key, value),
  },
  generateConversationTitle: () => "Test",
  saveConversation: vi.fn(),
  CONVERSATION_SAVE_DEBOUNCE_MS: 500,
  generateConversationId: () => "test-conversation",
  generateMessageId: () => "test-message",
}));

let root: Root;
let audio: ReturnType<typeof useSystemAudio>;
let active: boolean;
let captureMode: boolean | undefined;
let holdStart: Promise<void> | undefined;
function emit(name: string, payload?: unknown) {
  mocks.listeners.get(name)?.forEach((callback) => callback({ payload }));
}
function Harness() {
  audio = useSystemAudio();
  return null;
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  mocks.listeners.clear();
  mocks.invoke.mockReset();
  mocks.fetchSTT.mockReset();
  active = false;
  captureMode = undefined;
  holdStart = undefined;
  mocks.invoke.mockImplementation(async (command, args) => {
    if (command === "check_system_audio_access") return true;
    if (command === "start_system_audio_capture") {
      if (active) throw "Capture already running";
      active = true;
      captureMode = args.vadConfig.enabled;
      await holdStart;
      if (!captureMode) emit("continuous-recording-start");
    }
    if (command === "stop_system_audio_capture") {
      active = false;
      emit("capture-stopped");
    }
    if (command === "manual_stop_continuous") {
      active = false;
      emit("audio-encoding-error", "No audio recorded");
      emit("continuous-recording-stopped");
      emit("capture-stopped");
    }
  });
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(createElement(Harness)));
  mocks.invoke.mockClear();
});
afterEach(async () => { await act(async () => root.unmount()); });

async function openManual() {
  await act(async () => audio.startCapture());
  await act(async () => audio.updateVadConfiguration({ ...audio.vadConfig, enabled: false }));
}

it("releases automatic capture before starting manual recording", async () => {
  await openManual();
  expect(active).toBe(false);
  await act(async () => audio.startContinuousRecording());
  expect(audio.error).toBe("");
  expect(active).toBe(true);
  expect(captureMode).toBe(false);
  expect(audio.isRecordingInContinuousMode).toBe(true);
});

it("ignores a second start while the first start is pending", async () => {
  await openManual();
  let release!: () => void;
  holdStart = new Promise<void>((resolve) => { release = resolve; });
  mocks.invoke.mockClear();
  await act(async () => {
    const first = audio.startContinuousRecording();
    const second = audio.startContinuousRecording();
    release();
    await Promise.all([first, second]);
  });
  expect(mocks.invoke.mock.calls.filter(([name]) => name === "start_system_audio_capture")).toHaveLength(1);
  expect(audio.error).toBe("");
});

it("can discard and immediately record again without sending audio", async () => {
  await openManual();
  await act(async () => audio.startContinuousRecording());
  await act(async () => audio.ignoreContinuousRecording());
  expect(active).toBe(false);
  await act(async () => audio.startContinuousRecording());
  expect(audio.error).toBe("");
  expect(audio.isRecordingInContinuousMode).toBe(true);
  expect(mocks.fetchSTT).not.toHaveBeenCalled();
});

it("restarts automatic capture after leaving idle manual mode", async () => {
  await openManual();
  mocks.invoke.mockClear();
  await act(async () => audio.updateVadConfiguration({ ...audio.vadConfig, enabled: true }));
  expect(mocks.invoke.mock.calls.filter(([name]) => name === "start_system_audio_capture")).toHaveLength(1);
  expect(active).toBe(true);
  expect(captureMode).toBe(true);
  expect(audio.isContinuousMode).toBe(false);
});

it("releases the start guard after a device error so recording can be retried", async () => {
  await openManual();
  mocks.invoke.mockRejectedValueOnce("Selected output device is unavailable");
  await act(async () => audio.startContinuousRecording());
  expect(audio.error).toContain("Selected output device is unavailable");
  expect(audio.isAudioTransitioning).toBe(false);
  await act(async () => audio.startContinuousRecording());
  expect(audio.error).toBe("");
  expect(audio.isRecordingInContinuousMode).toBe(true);
});

it("does not intercept Enter while typing or while a button has focus", async () => {
  await openManual();
  mocks.invoke.mockClear();
  for (const tag of ["input", "textarea", "button"]) {
    const element = document.createElement(tag);
    document.body.append(element);
    await act(async () => { element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    element.remove();
  }
  expect(mocks.invoke).not.toHaveBeenCalled();
});

it("recovers from empty recording and allows the next manual recording", async () => {
  await openManual();
  await act(async () => audio.startContinuousRecording());
  await act(async () => audio.manualStopAndSend());
  expect(audio.isProcessing).toBe(false);
  expect(audio.isRecordingInContinuousMode).toBe(false);
  await act(async () => audio.startContinuousRecording());
  expect(audio.error).toBe("");
  expect(active).toBe(true);
});

it("removes asynchronous event listeners on unmount", async () => {
  await act(async () => root.unmount());
  expect([...mocks.listeners.values()].reduce((sum, callbacks) => sum + callbacks.size, 0)).toBe(0);
});

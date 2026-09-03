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
    selectedAudioDevices: {
      input: { id: "default", name: "Test microphone" },
      output: { id: "default", name: "Test speakers" },
    },
  },
  fetchSTT: vi.fn(),
  fetchAIResponse: vi.fn(),
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
vi.mock("@/lib/functions", () => ({ fetchSTT: mocks.fetchSTT, fetchAIResponse: mocks.fetchAIResponse }));
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
  mocks.fetchAIResponse.mockReset();
  active = false;
  captureMode = undefined;
  holdStart = undefined;
  mocks.invoke.mockImplementation(async (command, args) => {
    if (command === "check_system_audio_access") return true;
    if (command === "start_system_audio_capture") {
      if (active) throw "Capture already running";
      active = true;
      emit("capture-started", 48000);
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

it("applies sensitivity changes to the active native capture without changing modes", async () => {
  await act(async () => audio.startCapture());
  mocks.invoke.mockClear();
  const config = { ...audio.vadConfig, sensitivity_rms: 0.0015, peak_threshold: 0.004 };
  await act(async () => audio.updateVadConfiguration(config));
  expect(mocks.invoke.mock.calls.map(([name]) => name)).toEqual([
    "stop_system_audio_capture", "update_vad_config", "start_system_audio_capture",
  ]);
  expect(mocks.invoke).toHaveBeenLastCalledWith("start_system_audio_capture", {
    vadConfig: config, deviceId: null,
  });
  expect(audio.captureActive).toBe(true);
  expect(audio.error).toBe("");
});

it("shows real signal levels and clears them when native capture stops", async () => {
  await act(async () => audio.startCapture());
  const level = { rms: 0.002, peak: 0.006, samples: 9600 };
  await act(async () => emit("system-audio-level", level));
  expect(audio.audioLevel).toEqual(level);
  expect(audio.captureDeviceName).toBe("Test speakers");
  expect(mocks.fetchSTT).not.toHaveBeenCalled();
  await act(async () => emit("capture-stopped"));
  expect(audio.captureActive).toBe(false);
  expect(audio.audioLevel).toBe(null);
});

it("does not send an empty transcript to the answer model", async () => {
  await act(async () => audio.startCapture());
  mocks.fetchSTT.mockResolvedValue("");
  await act(async () => emit("speech-detected", "AQID"));
  expect(mocks.fetchSTT).toHaveBeenCalledOnce();
  expect(mocks.fetchAIResponse).not.toHaveBeenCalled();
  expect(audio.lastTranscription).toBe("");
  expect(audio.error).toContain("No speech was recognized");
  expect(audio.isProcessing).toBe(false);
});

it("displays LLM chunks after transcription and passes cancellation to the request", async () => {
  mocks.fetchSTT.mockResolvedValue("What is the test?");
  mocks.fetchAIResponse.mockImplementation(async function* () { yield "First "; yield "answer"; });
  await act(async () => audio.startCapture());
  await act(async () => emit("speech-detected", "AQID"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(audio.lastTranscription).toBe("What is the test?");
  expect(audio.lastAIResponse).toBe("First answer");
  expect(audio.error).toBe("");
  expect(mocks.fetchAIResponse).toHaveBeenCalledWith(expect.objectContaining({ source: "system", signal: expect.any(AbortSignal) }));
});

it("keeps a completed transcript and answer visible after stopping capture", async () => {
  mocks.fetchSTT.mockResolvedValue("What is the test?");
  mocks.fetchAIResponse.mockImplementation(async function* () { yield "Visible answer"; });
  await act(async () => audio.startCapture());
  await act(async () => emit("speech-detected", "AQID"));
  await act(async () => audio.stopCapture());
  expect(audio.lastTranscription).toBe("What is the test?");
  expect(audio.lastAIResponse).toBe("Visible answer");
  expect(audio.isPopoverOpen).toBe(true);
});

it("shows a visible error when transcription succeeds but the LLM yields no text", async () => {
  mocks.fetchSTT.mockResolvedValue("What is the test?");
  mocks.fetchAIResponse.mockImplementation(async function* () {});
  await act(async () => audio.startCapture());
  await act(async () => emit("speech-detected", "AQID"));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  expect(audio.lastTranscription).toBe("What is the test?");
  expect(audio.error).toContain("no answer text");
  expect(audio.isPopoverOpen).toBe(true);
  expect(audio.isAIProcessing).toBe(false);
  expect(audio.conversation.messages).toHaveLength(0);
});

it("adds microphone speech as You without auto-generating in question mode", async () => {
  mocks.fetchSTT.mockResolvedValue("How should I answer?");
  await act(async () => audio.startCapture());
  await act(async () => {
    audio.handleMicrophoneAudio(new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), Date.now());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(mocks.fetchSTT).toHaveBeenCalledWith(expect.objectContaining({ source: "microphone" }));
  expect(audio.transcriptTurns).toHaveLength(1);
  expect(audio.transcriptTurns[0]).toMatchObject({ source: "microphone", speaker: "You" });
  expect(mocks.fetchAIResponse).not.toHaveBeenCalled();
});

it("pauses and resumes both-channel Listen without clearing the transcript", async () => {
  mocks.fetchSTT.mockResolvedValue("A captured statement");
  await act(async () => audio.startCapture());
  await act(async () => {
    audio.handleMicrophoneAudio(new Blob([new Uint8Array([1])], { type: "audio/wav" }), Date.now());
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => audio.pauseCapture());
  expect(audio.isPaused).toBe(true);
  expect(audio.transcriptTurns).toHaveLength(1);
  await act(async () => audio.resumeCapture());
  expect(audio.isPaused).toBe(false);
  expect(audio.transcriptTurns).toHaveLength(1);
  expect(active).toBe(true);
});

it("queues a newer generation without aborting the active request", async () => {
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let call = 0;
  mocks.fetchAIResponse.mockImplementation(async function* () {
    call += 1;
    if (call === 1) {
      yield "First answer";
      await firstGate;
      return;
    }
    yield "Second answer";
  });

  let first!: Promise<void>;
  await act(async () => {
    first = audio.processWithAI("First", "Prompt", []);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const firstSignal = mocks.fetchAIResponse.mock.calls[0][0].signal as AbortSignal;
  await act(async () => audio.processWithAI("Second", "Prompt", []));
  expect(firstSignal.aborted).toBe(false);
  expect(audio.responseQueued).toBe(true);

  await act(async () => {
    releaseFirst();
    await first;
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(mocks.fetchAIResponse).toHaveBeenCalledTimes(2);
  expect(audio.lastAIResponse).toBe("Second answer");
  expect(audio.responseQueued).toBe(false);
});

it("lets an in-flight response finish after capture stops", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  mocks.fetchSTT.mockResolvedValue("What should I say?");
  mocks.fetchAIResponse.mockImplementation(async function* () {
    await gate;
    yield "Keep the finished response";
  });

  await act(async () => audio.startCapture());
  await act(async () => {
    emit("speech-detected", "AQID");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const signal = mocks.fetchAIResponse.mock.calls[0][0].signal as AbortSignal;
  await act(async () => audio.stopCapture());
  expect(signal.aborted).toBe(false);

  await act(async () => {
    release();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(audio.lastAIResponse).toBe("Keep the finished response");
  expect(audio.isPopoverOpen).toBe(true);
});

import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
import { fetchSTT } from "../src/lib/functions/stt.function";
import { sttMetadata } from "../src/lib/functions/diagnostics";
import { SPEECH_TO_TEXT_PROVIDERS } from "../src/config/stt.constants";

const params = () => ({
  provider: SPEECH_TO_TEXT_PROVIDERS.find(p => p.id === "openai-whisper")!,
  selectedProvider: { provider: "openai-whisper", variables: { API_KEY: "private-test-key", MODEL: "whisper-1" } },
  audio: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }), source: "system" as const,
});
const updates = () => mocks.invoke.mock.calls.filter(([name]) => name === "diagnostics_record_stt").map(([, args]) => args.update);
beforeEach(() => { mocks.fetch.mockReset(); mocks.invoke.mockReset(); });
afterEach(() => vi.useRealTimers());

it("exposes only whitelisted metadata, never editable URLs, model strings or transcript text", async () => {
  expect(sttMetadata("https://custom.example/private-key?token=secret", "private-model")).toEqual({ provider: "custom", model: "custom" });
  expect(sttMetadata("https://api.openai.com.evil.test", "whisper-1").provider).toBe("custom");
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ text: "Особиста розмова" })));
  await expect(fetchSTT(params())).resolves.toBe("Особиста розмова");
  expect(updates().map(u => u.stage)).toEqual(["sending", "succeeded"]);
  expect(updates()[1]).toMatchObject({ provider: "openai", model: "whisper1", source: "system", audio_bytes: 3, transcript_chars: 16, http_status: 200 });
  const metadata = JSON.stringify(updates());
  for (const secret of ["private-test-key", "Особиста розмова", "https:", "Authorization"]) expect(metadata).not.toContain(secret);
});

it.each([[401, "invalid_api_key", "unauthorized"], [429, "insufficient_quota", "quota"], [429, "rate_limit_exceeded", "rate_limit"]])("classifies HTTP %s without exposing the error body", async (status, code, kind) => {
  mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: { code, message: "private-error-text" } }), { status: Number(status) }));
  await expect(fetchSTT(params())).rejects.toThrow(`HTTP ${status}`);
  expect(updates().at(-1)).toMatchObject({ stage: "http_error", http_status: status, error_kind: kind });
  expect(JSON.stringify(updates())).not.toContain("private-error-text");
});

it("distinguishes empty recognition from a failed request", async () => {
  mocks.fetch.mockResolvedValue(new Response('{"text":""}'));
  await expect(fetchSTT(params())).resolves.toBe("");
  expect(updates().at(-1)).toMatchObject({ stage: "empty", transcript_chars: 0, http_status: 200 });
});

it("aborts the native request at the deadline and records a timeout", async () => {
  vi.useFakeTimers();
  mocks.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const request = fetchSTT(params());
  const result = expect(request).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(30_001);
  await result;
  expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(updates().at(-1).stage).toBe("timed_out");
});

it("does not break recognition when diagnostics are unavailable", async () => {
  mocks.invoke.mockRejectedValue(new Error("Unavailable"));
  mocks.fetch.mockResolvedValue(new Response('{"text":"test"}'));
  await expect(fetchSTT(params())).resolves.toBe("test");
});

it("reports missing provider configuration before any network request", async () => {
  await expect(fetchSTT({ ...params(), provider: undefined })).rejects.toThrow("config not found");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(updates().at(-1)).toMatchObject({ stage: "invalid_config", provider: "unconfigured", http_status: null });
});

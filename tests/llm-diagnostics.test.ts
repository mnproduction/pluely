import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), invoke: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: mocks.fetch }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@/lib", () => ({ getResponseSettings: () => ({ language: "en", responseLength: "default" }), RESPONSE_LENGTHS: [], LANGUAGES: [] }));
import { fetchAIResponse } from "../src/lib/functions/ai-response.function";
import { AI_PROVIDERS } from "../src/config/ai-providers.constants";

const params = () => ({
  provider: AI_PROVIDERS.find(p => p.id === "grok")!,
  selectedProvider: { provider: "grok", variables: { API_KEY: "private-test-key", MODEL: "grok-test-model" } },
  userMessage: "private conversation text", source: "system" as const,
});
const updates = () => mocks.invoke.mock.calls.filter(([name]) => name === "diagnostics_record_llm").map(([, args]) => args.update);
async function collect(input = params()): Promise<string> { let result = ""; for await (const part of fetchAIResponse(input)) result += part; return result; }
beforeEach(() => { mocks.fetch.mockReset(); mocks.invoke.mockReset(); });
afterEach(() => vi.useRealTimers());

it("reads the final SSE event even without a trailing newline and accepts uppercase configuration", async () => {
  mocks.fetch.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"private reply"}}]}'));
  await expect(collect()).resolves.toBe("private reply");
  expect(updates().map(u => u.stage)).toEqual(["preparing", "sending", "streaming", "streaming", "succeeded"]);
  expect(updates()[2]).toMatchObject({ http_status: 200, response_chars: 0, first_text_ms: null });
  expect(updates().at(-1)).toMatchObject({ provider: "xai", model: "grok", source: "system", http_status: 200, response_chars: 13, chunks: 1 });
  for (const secret of ["private-test-key", "grok-test-model", "private conversation text", "private reply"]) expect(JSON.stringify(updates())).not.toContain(secret);
});

it("finishes at DONE even when the server keeps the connection open", async () => {
  const cancel = vi.fn();
  mocks.fetch.mockResolvedValue(new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n')); }, cancel,
  })));
  await expect(collect()).resolves.toBe("ok");
  expect(cancel).toHaveBeenCalled();
});

it("reports empty answers instead of silently succeeding", async () => {
  mocks.fetch.mockResolvedValue(new Response('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
  await expect(collect()).rejects.toThrow("no answer text");
  expect(updates().at(-1)).toMatchObject({ stage: "empty", response_chars: 0 });
});

it("treats a whitespace-only stream as an empty answer", async () => {
  mocks.fetch.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":" "}}]}\n\ndata: [DONE]\n\n'));
  await expect(collect()).rejects.toThrow("no answer text");
  expect(updates().at(-1)).toMatchObject({ stage: "empty", response_chars: 1 });
});

it("surfaces streaming error events instead of ignoring them", async () => {
  mocks.fetch.mockResolvedValue(new Response('data: {"error":{"code":"model_not_found","message":"private-error"}}\n\n'));
  await expect(collect()).rejects.toThrow("streaming error");
  expect(updates().at(-1)).toMatchObject({ stage: "decode_error", error_kind: "model" });
  expect(JSON.stringify(updates())).not.toContain("private-error");
});

it("throws an HTTP failure so it cannot be saved as an AI answer", async () => {
  mocks.fetch.mockResolvedValue(new Response('{"error":{"code":"insufficient_quota","message":"private-error"}}', { status: 429 }));
  await expect(collect()).rejects.toThrow("HTTP 429");
  expect(updates().at(-1)).toMatchObject({ stage: "http_error", error_kind: "quota", http_status: 429, response_chars: 0 });
});

it("identifies a missing model without exposing configuration values", async () => {
  await expect(collect({ ...params(), selectedProvider: { provider: "grok", variables: { API_KEY: "private-test-key", MODEL: "" } } })).rejects.toThrow("Missing required variable: model");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(updates().at(-1)).toMatchObject({ stage: "invalid_config", missing: "model", model: "unset" });
});

it("cancels a request at the deadline and exposes its timeout", async () => {
  vi.useFakeTimers();
  mocks.fetch.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
  }));
  const result = expect(collect()).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(120_001);
  await result;
  expect(mocks.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  expect(updates().at(-1).stage).toBe("timed_out");
});

it("records user cancellation separately from failures", async () => {
  const controller = new AbortController(); controller.abort();
  let response = "";
  for await (const chunk of fetchAIResponse({ ...params(), signal: controller.signal })) response += chunk;
  expect(response).toBe("");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(updates().at(-1).stage).toBe("cancelled");
});

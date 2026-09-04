import { beforeEach, describe, expect, it, vi } from "vitest";
const nativeFetch = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: nativeFetch }));
vi.mock("@/lib", () => ({ getResponseSettings: () => ({ language: "en", responseLength: "default" }), RESPONSE_LENGTHS: [], LANGUAGES: [] }));
import { providerFetch, validateProviderUrl } from "../src/lib/functions/provider-fetch";
import { fetchSTT } from "../src/lib/functions/stt.function";
import { fetchAIResponse } from "../src/lib/functions/ai-response.function";
import { SPEECH_TO_TEXT_PROVIDERS } from "../src/config/stt.constants";
import { AI_PROVIDERS } from "../src/config/ai-providers.constants";
import { validateCurl } from "../src/lib/curl-validator";

beforeEach(() => nativeFetch.mockReset());
describe("direct provider requests", () => {
  it("rejects a literal secret in a credential header", () => {
    const result = validateCurl(
      "curl https://example.com -H 'Authorization: Bearer test' --data '{{TEXT}}'",
      ["TEXT"]
    );
    expect(result.isValid).toBe(false);
    expect(result.message).toContain("{{API_KEY}}");
  });

  it("accepts credential placeholders and local providers without authentication", () => {
    expect(
      validateCurl(
        "curl https://example.com -H 'Authorization: Bearer {{API_KEY}}' --data '{{TEXT}}'",
        ["TEXT"]
      ).isValid
    ).toBe(true);
    expect(
      validateCurl("curl http://127.0.0.1:11434 --data '{{TEXT}}'", ["TEXT"])
        .isValid
    ).toBe(true);
  });

  it.each(["http://api.x.ai/v1/stt", "http://localhost.evil.test", "http://[::1]:11434", "file:///C:/secret", "https://key@example.com", "https://api.x.ai/#secret"])("rejects unsafe URL %s before networking", async (url) => {
    await expect(providerFetch(url, {})).rejects.toThrow();
    expect(nativeFetch).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:11434/v1/chat/completions", "http://127.0.0.1:1337", "https://api.x.ai/v1/stt"])("accepts explicit provider URL %s", (url) => {
    expect(validateProviderUrl(url)).toBe(new URL(url).href);
  });
  it("sends xAI STT audio last, without a fabricated model or manual multipart boundary", async () => {
    nativeFetch.mockResolvedValue(new Response(JSON.stringify({ text: "hello" })));
    const provider = SPEECH_TO_TEXT_PROVIDERS.find((p) => p.id === "xai-stt")!;
    const result = await fetchSTT({
      provider: { ...provider, curl: provider.curl.replace('-F "file=', '-F "format=false" -F "file=') },
      selectedProvider: { provider: "xai-stt", variables: { API_KEY: "fake-xai-test-key" } },
      audio: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" }),
    });
    expect(result).toBe("hello");
    const [url, options] = nativeFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/stt");
    expect(options.headers.Authorization).toBe("Bearer fake-xai-test-key");
    expect(options.maxRedirections).toBe(0);
    expect(Object.keys(options.headers).some((k) => k.toLowerCase() === "content-type")).toBe(false);
    expect([...options.body.keys()]).toEqual(["format", "file"]);
    expect(options.body.get("file").name).toBe("audio.webm");
    expect(options.body.get("model")).toBe(null);
  });
  it("streams Grok text and screenshots directly to xAI", async () => {
    nativeFetch.mockResolvedValue(new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: [DONE]\n\n'));
    const provider = AI_PROVIDERS.find((p) => p.id === "grok")!;
    const chunks: string[] = [];
    for await (const chunk of fetchAIResponse({ provider,
      selectedProvider: { provider: "grok", variables: { api_key: "fake-xai-test-key", model: "test-model" } },
      userMessage: "Describe this {{API_KEY}}", systemPrompt: "Be helpful", imagesBase64: ["aGVsbG8="],
    })) chunks.push(chunk);
    expect(chunks.join("")).toBe("Hello");
    const [url, options] = nativeFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect(options.maxRedirections).toBe(0);
    expect(options.headers.Authorization).toBe("Bearer fake-xai-test-key");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(true);
    expect(JSON.stringify(body.messages)).toContain("Describe this");
    expect(JSON.stringify(body.messages)).toContain("{{API_KEY}}");
    expect(JSON.stringify(body.messages)).toContain("aGVsbG8=");
    expect(JSON.stringify(body.messages)).not.toContain("fake-xai-test-key");
  });
  it.each(["Тест українського мовлення", ""])("preserves OpenAI Whisper recognition without fabricating text: %s", async (text) => {
    nativeFetch.mockResolvedValue(new Response(JSON.stringify({ text })));
    const provider = SPEECH_TO_TEXT_PROVIDERS.find((p) => p.id === "openai-whisper")!;
    const result = await fetchSTT({
      provider,
      selectedProvider: { provider: provider.id, variables: { API_KEY: "fake-openai-key", MODEL: "whisper-1" } },
      audio: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" }),
    });
    expect(result).toBe(text);
    const [url, options] = nativeFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
    expect(options.body.get("model")).toBe("whisper-1");
    expect(options.body.get("file").name).toBe("audio.wav");
    expect(options.headers.Authorization).toBe("Bearer fake-openai-key");
  });
});

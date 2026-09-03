import {
  buildDynamicMessages,
  deepVariableReplacer,
  extractVariables,
  getByPath,
  getStreamingContent,
} from "./common.function";
import { Message, TYPE_PROVIDER } from "@/types";
import { providerFetch } from "./provider-fetch";
import curl2Json from "@bany/curl-to-json";
import { getResponseSettings, RESPONSE_LENGTHS, LANGUAGES } from "@/lib";
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from "@/config/constants";
import { llmMetadata, recordLlm, sttErrorKind, type AudioSource, type LlmDiagnostic, type LlmStage } from "./diagnostics";

function buildEnhancedSystemPrompt(baseSystemPrompt?: string): string {
  const responseSettings = getResponseSettings();
  const prompts: string[] = [];

  if (baseSystemPrompt) {
    prompts.push(baseSystemPrompt);
  }

  const lengthOption = RESPONSE_LENGTHS.find(
    (l) => l.id === responseSettings.responseLength
  );
  if (lengthOption?.prompt?.trim()) {
    prompts.push(lengthOption.prompt);
  }

  const languageOption = LANGUAGES.find(
    (l) => l.id === responseSettings.language
  );
  if (languageOption?.prompt?.trim()) {
    prompts.push(languageOption.prompt);
  }

  // Add markdown formatting instructions
  prompts.push(MARKDOWN_FORMATTING_INSTRUCTIONS);

  return prompts.join(" ");
}

export async function* fetchAIResponse(params: {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  systemPrompt?: string;
  history?: Message[];
  userMessage: string;
  imagesBase64?: string[];
  signal?: AbortSignal;
  source?: AudioSource;
}): AsyncIterable<string> {
  const startedAt = Date.now();
  const diagnostic: LlmDiagnostic = {
    request_id: crypto.randomUUID(), stage: "preparing", ...llmMetadata("", ""),
    source: params.source ?? "other", duration_ms: 0, first_text_ms: null,
    response_chars: 0, chunks: 0, http_status: null, error_kind: null, missing: null,
  };
  let lastReportAt = 0;
  let finished = false;
  let hasAnswerText = false;
  let timedOut = false;
  let failureStage: LlmStage = "invalid_config";
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  params.signal?.addEventListener("abort", abort, { once: true });
  const report = async (stage: LlmStage) => {
    diagnostic.stage = stage;
    diagnostic.duration_ms = Date.now() - startedAt;
    lastReportAt = Date.now();
    await recordLlm({ ...diagnostic });
  };
  const receive = async (text: string) => {
    if (text.trim()) hasAnswerText = true;
    const first = diagnostic.first_text_ms === null;
    if (first) diagnostic.first_text_ms = Date.now() - startedAt;
    diagnostic.response_chars += Array.from(text).length;
    diagnostic.chunks++;
    if (first || Date.now() - lastReportAt >= 1000) await report("streaming");
    return text;
  };
  try {
    const {
      provider,
      selectedProvider,
      systemPrompt,
      history = [],
      userMessage,
      imagesBase64 = [],
    } = params;

    // Check if already aborted
    if (params.signal?.aborted) {
      return;
    }

    const enhancedSystemPrompt = buildEnhancedSystemPrompt(systemPrompt);

    if (!provider || !selectedProvider?.provider) {
      diagnostic.missing = "provider";
      throw new Error("No AI provider configured. Select one in AI settings.");
    }

    let curlJson;
    try {
      curlJson = curl2Json(provider.curl);
    } catch (error) {
      throw new Error(
        `Failed to parse curl: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    const allVariables: Record<string, string> = {
      ...Object.fromEntries(
        Object.entries(selectedProvider.variables || {}).map(([key, value]) => [key.toUpperCase(), value])
      ),
      SYSTEM_PROMPT: enhancedSystemPrompt || "",
    };
    const url = deepVariableReplacer(curlJson.url || "", allVariables);
    Object.assign(diagnostic, llmMetadata(url, allVariables.MODEL));
    await report("preparing");
    const extractedVariables = extractVariables(provider.curl);
    const requiredVars = extractedVariables.filter(
      ({ key }) => key !== "SYSTEM_PROMPT" && key !== "TEXT" && key !== "IMAGE"
    );
    for (const { key } of requiredVars) {
      if (
        !allVariables[key.toUpperCase()] ||
        allVariables[key.toUpperCase()].trim() === ""
      ) {
        diagnostic.missing = key === "api_key" ? "api_key" : key === "model" ? "model" : "other";
        throw new Error(
          `Missing required variable: ${key}. Please configure it in settings.`
        );
      }
    }

    if (!userMessage) {
      throw new Error("User message is required");
    }
    if (imagesBase64.length > 0 && !provider.curl.includes("{{IMAGE}}")) {
      throw new Error(
        `Provider ${provider?.id ?? "unknown"} does not support image input`
      );
    }

    // Expand only the trusted provider template. Chat text and history must
    // never interpret {{API_KEY}} or other configuration placeholders.
    let bodyObj: any = deepVariableReplacer(curlJson.data || {}, allVariables);
    const messagesKey = Object.keys(bodyObj).find((key) =>
      ["messages", "contents", "conversation", "history"].includes(key)
    );

    if (messagesKey && Array.isArray(bodyObj[messagesKey])) {
      const finalMessages = buildDynamicMessages(
        bodyObj[messagesKey],
        history,
        userMessage,
        imagesBase64
      );
      bodyObj[messagesKey] = finalMessages;
    }

    const headers = deepVariableReplacer(curlJson.header || {}, allVariables);
    headers["Content-Type"] = "application/json";

    if (provider?.streaming) {
      if (typeof bodyObj === "object" && bodyObj !== null) {
        const streamKey = Object.keys(bodyObj).find(
          (k) => k.toLowerCase() === "stream"
        );
        if (streamKey) {
          bodyObj[streamKey] = true;
        } else {
          bodyObj.stream = true;
        }
      }
    }


    Object.assign(diagnostic, llmMetadata(url, bodyObj?.model ?? allVariables.MODEL));
    await report("sending");
    failureStage = "network_error";
    deadline = setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
    let response;
    try {
      response = await providerFetch(url, {
        method: curlJson.method || "POST",
        headers,
        body: curlJson.method === "GET" ? undefined : JSON.stringify(bodyObj),
        signal: controller.signal,
      });
    } catch (fetchError) {
      diagnostic.error_kind = "network";
      throw new Error("Could not connect to the AI provider. Check the connection and provider settings.");
    }

    diagnostic.http_status = response.status;
    if (!response.ok) {
      failureStage = "http_error";
      let code: unknown;
      try { const body = await response.json(); code = body.error?.code ?? body.code; } catch {}
      diagnostic.error_kind = sttErrorKind(response.status, code);
      const hints = { unauthorized: "Check the API key and account permissions.", quota: "Check the provider account balance and quota.", rate_limit: "Provider rate limit reached. Try again shortly.", model: "Check the selected model and your access to it." };
      const hint = hints[diagnostic.error_kind as keyof typeof hints] ?? "Check the AI provider settings or try again.";
      throw new Error(`AI provider returned HTTP ${response.status}. ${hint}`);
    }

    // Publish response headers before waiting for content, including slow reasoning models.
    await report("streaming");
    failureStage = "decode_error";
    if (!provider?.streaming) {
      const json = await response.json();
      const content = getByPath(json, provider.responseContentPath || "");
      if (typeof content === "string" && content.trim()) yield await receive(content);
    } else {
      if (!response.body) throw new Error("AI response body is missing.");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ended = false;
      while (!ended) {
        if (controller.signal.aborted) throw new DOMException("Aborted", "AbortError");
        const { done, value } = await reader.read();
        buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = done ? "" : lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.substring(5).trim();
          if (!payload) continue;
          if (payload === "[DONE]") { ended = true; break; }
          const parsed = JSON.parse(payload);
          if (parsed.error) {
            diagnostic.error_kind = sttErrorKind(0, parsed.error.code);
            throw new Error("AI provider reported a streaming error. Check provider settings and retry.");
          }
          const delta = getStreamingContent(parsed, provider.responseContentPath || "");
          if (delta) yield await receive(delta);
        }
        if (done) break;
      }
    }
    if (!hasAnswerText) {
      failureStage = "empty";
      throw new Error("The AI provider returned no answer text. Check the model and response format in AI settings.");
    }
    await report("succeeded");
    finished = true;
  } catch (error) {
    if (params.signal?.aborted && !timedOut) { await report("cancelled"); finished = true; return; }
    await report(timedOut ? "timed_out" : failureStage);
    finished = true;
    if (timedOut) throw new Error("AI response timed out after 120 seconds. Try a faster model or retry.");
    throw error instanceof Error ? error : new Error("AI request failed.");
  } finally {
    clearTimeout(deadline);
    params.signal?.removeEventListener("abort", abort);
    controller.abort();
    try { await reader?.cancel(); } catch {}
    if (!finished) await report("cancelled");
  }
}

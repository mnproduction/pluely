import {
  deepVariableReplacer,
  getByPath,
  blobToBase64,
} from "./common.function";
import { providerFetch } from "./provider-fetch";
import { recordStt, sttMetadata, sttErrorKind, type AudioSource, type SttDiagnostic, type SttStage } from "./diagnostics";

import { TYPE_PROVIDER } from "@/types";
import curl2Json from "@bany/curl-to-json";

export interface STTParams {
  provider: TYPE_PROVIDER | undefined;
  selectedProvider: {
    provider: string;
    variables: Record<string, string>;
  };
  audio: File | Blob;
  source?: AudioSource;
}

/**
 * Returns recognized speech only. Empty recognition stays empty; failures throw.
 */
export async function fetchSTT(params: STTParams): Promise<string> {
  const startedAt = Date.now();
  const diagnostic: SttDiagnostic = {
    request_id: crypto.randomUUID(), stage: "invalid_config", ...sttMetadata("", ""),
    source: params.source ?? "other", audio_bytes: params.audio?.size ?? 0,
    duration_ms: 0, http_status: null, transcript_chars: null, error_kind: null,
  };
  const report = async (stage: SttStage) => {
    diagnostic.stage = stage;
    diagnostic.duration_ms = Date.now() - startedAt;
    await recordStt({ ...diagnostic });
  };
  const finish = async (text: string) => {
    diagnostic.transcript_chars = Array.from(text).length;
    await report(text ? "succeeded" : "empty");
    return text;
  };
  let failureStage: SttStage = "invalid_config";
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;

  try {
    const { provider, selectedProvider, audio } = params;

    if (!selectedProvider?.provider) throw new Error("No speech provider selected.");
    if (!provider) throw new Error("Speech provider config not found.");
    if (!audio) throw new Error("Audio file is required");

    let curlJson: any;
    try {
      curlJson = curl2Json(provider.curl);
    } catch (error) {
      throw new Error(
        `Failed to parse curl: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }

    // Validate audio file
    const file = audio as File;
    if (file.size === 0) throw new Error("Audio file is empty");

    // Build variable map
    const allVariables = {
      ...Object.fromEntries(
        Object.entries(selectedProvider.variables).map(([key, value]) => [
          key.toUpperCase(),
          value,
        ])
      ),
    };

    // Prepare request
    let url = deepVariableReplacer(curlJson.url || "", allVariables);
    const headers = deepVariableReplacer(curlJson.header || {}, allVariables);
    const formData = deepVariableReplacer(curlJson.form || {}, allVariables);

    // To Check if API accepts Binary Data
    const isBinaryUpload = provider.curl.includes("--data-binary");
    // Fetch URL Params
    const rawParams = curlJson.params || {};
    // Decode Them
    const decodedParams = Object.fromEntries(
      Object.entries(rawParams).map(([key, value]) => [
        key,
        typeof value === "string" ? decodeURIComponent(value) : "",
      ])
    );
    // Get the Parameters from allVariables
    const replacedParams = deepVariableReplacer(decodedParams, allVariables);

    // Add query parameters to URL
    const queryString = new URLSearchParams(replacedParams).toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }

    let finalHeaders = { ...headers };
    let body: FormData | string | Blob;

    const isForm =
      provider.curl.includes("-F ") || provider.curl.includes("--form");
    if (isForm) {
      const form = new FormData();
      const freshBlob = new Blob([await audio.arrayBuffer()], {
        type: audio.type,
      });
      const headerKeys = Object.keys(headers).map((k) =>
        k.toUpperCase().replace(/[-_]/g, "")
      );

      for (const [key, val] of Object.entries(formData)) {
        if (typeof val !== "string") {
          if (
            !val ||
            headerKeys.includes(key.toUpperCase()) ||
            key.toUpperCase() === "AUDIO"
          )
            continue;
          form.append(key.toLowerCase(), val as string | Blob);
          continue;
        }

        // Check if key is a number, which indicates array-like parsing from curl2json
        if (!isNaN(parseInt(key, 10))) {
          const [formKey, ...formValueParts] = val.split("=");
          const formValue = formValueParts.join("=");

          if (formKey.toLowerCase() === "file") continue; // Already handled by form.append('file', audio)

          if (
            !formValue ||
            headerKeys.includes(formKey.toUpperCase().replace(/[-_]/g, ""))
          )
            continue;

          form.append(formKey, formValue);
        } else {
          if (key.toLowerCase() === "file") continue; // Already handled by form.append('file', audio)
          if (
            !val ||
            headerKeys.includes(key.toUpperCase()) ||
            key.toUpperCase() === "AUDIO"
          )
            continue;
          form.append(key.toLowerCase(), val as string | Blob);
        }
      }
      // xAI requires the audio file to be the last multipart field.
      const extension = audio.type.includes("webm") ? "webm" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("mpeg") ? "mp3" : "wav";
      form.append("file", freshBlob, `audio.${extension}`);
      for (const key of Object.keys(finalHeaders)) {
        if (key.toLowerCase() === "content-type") delete finalHeaders[key];
      }
      body = form;
    } else if (isBinaryUpload) {
      // Deepgram-style: raw binary body
      body = new Blob([await audio.arrayBuffer()], {
        type: audio.type,
      });
    } else {
      // Google-style: JSON payload with base64
      allVariables.AUDIO = await blobToBase64(audio);
      const dataObj = curlJson.data ? { ...curlJson.data } : {};
      body = JSON.stringify(deepVariableReplacer(dataObj, allVariables));
    }


    Object.assign(diagnostic, sttMetadata(url, body instanceof FormData ? body.get("model") : allVariables.MODEL));
    await report("sending");
    const controller = new AbortController();
    timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
    failureStage = "network_error";
    // Cancel the native HTTP request too, not just the UI's wait.
    let response: Response;
    try {
      response = await providerFetch(url, {
        method: curlJson.method || "POST",
        headers: finalHeaders,
        body: curlJson.method === "GET" ? undefined : body,
        signal: controller.signal,
      });
    } catch (e) {
      throw new Error(`Network error: ${e instanceof Error ? e.message : e}`);
    }

    diagnostic.http_status = response.status;
    if (!response.ok) {
      failureStage = "http_error";
      let errText = "";
      try {
        errText = await response.text();
      } catch {}
      let errMsg: string;
      try {
        const errObj = JSON.parse(errText);
        diagnostic.error_kind = sttErrorKind(response.status, errObj.error?.code ?? errObj.code);
        errMsg = errObj.message || errText;
      } catch {
        diagnostic.error_kind = sttErrorKind(response.status, null);
        errMsg = errText || response.statusText;
      }
      throw new Error(`HTTP ${response.status}: ${errMsg}`);
    }

    failureStage = "decode_error";
    const responseText = await response.text();
    let data: any;
    try {
      data = JSON.parse(responseText);
    } catch {
      return await finish(responseText.trim());
    }

    // Extract transcription
    const rawPath = provider.responseContentPath || "text";
    const path = rawPath.charAt(0).toLowerCase() + rawPath.slice(1);
    const value = getByPath(data, path);
    if (value != null && typeof value !== "string") throw new Error("Provider returned an invalid transcription format");
    return await finish((value || "").trim());
  } catch (err) {
    if (timedOut) failureStage = "timed_out";
    if (failureStage === "network_error") diagnostic.error_kind = "network";
    await report(failureStage);
    if (timedOut) throw new Error("Speech transcription timed out (30s)");
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  } finally {
    clearTimeout(timeout);
  }
}

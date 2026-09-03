import { invoke } from "@tauri-apps/api/core";

export type SttStage = "sending" | "succeeded" | "empty" | "http_error" | "network_error" | "invalid_config" | "decode_error" | "timed_out";
export type AudioSource = "system" | "microphone" | "other";
export type SttErrorKind = "unauthorized" | "quota" | "rate_limit" | "model" | "bad_request" | "server" | "network" | "unknown";

// Classify known values instead of transmitting editable provider strings.
export function sttMetadata(url: string, model: unknown) {
  let provider = "custom";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:") {
      provider = ({ "api.openai.com": "openai", "api.x.ai": "xai", "api.groq.com": "groq",
        "speech.googleapis.com": "google", "api.deepgram.com": "deepgram", "api.elevenlabs.io": "elevenlabs" } as Record<string, string>)[parsed.host] || "custom";
    }
  } catch { provider = "unconfigured"; }
  const models: Record<string, string> = {
    "whisper-1": "whisper1", "gpt-4o-transcribe": "gpt4o_transcribe", "gpt-4o-mini-transcribe": "gpt4o_mini_transcribe",
    "whisper-large-v3": "whisper_large_v3", "whisper-large-v3-turbo": "whisper_large_v3_turbo",
  };
  return { provider, model: typeof model === "string" && model ? (Object.prototype.hasOwnProperty.call(models, model) ? models[model] : "custom") : "unset" };
}

export interface SttDiagnostic {
  request_id: string;
  stage: SttStage;
  provider: string;
  model: string;
  source: AudioSource;
  audio_bytes: number;
  duration_ms: number;
  http_status: number | null;
  transcript_chars: number | null;
  error_kind: SttErrorKind | null;
}

export async function recordStt(update: SttDiagnostic): Promise<void> {
  // Diagnostics must not prevent transcription if their IPC command fails.
  try { await invoke("diagnostics_record_stt", { update }); } catch {}
}

export function sttErrorKind(status: number, code: unknown): SttErrorKind {
  if (code === "insufficient_quota") return "quota";
  if (code === "model_not_found") return "model";
  if (status === 401 || status === 403) return "unauthorized";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status >= 400) return "bad_request";
  return "unknown";
}

export type ListenSource = "microphone" | "system";
export type ListenSpeaker = "You" | "Them";
export type AutoResponseMode = "questions" | "pause" | "off";

export interface ListenTranscriptTurn {
  id: string;
  source: ListenSource;
  speaker: ListenSpeaker;
  text: string;
  capturedAt: number;
  completedAt: number;
  sequence: number;
}

const QUESTION_START = /^(what|why|how|when|where|who|which|can|could|would|will|do|does|did|is|are|should|tell me|walk me through|show me|explain|що|чому|як|коли|де|хто|який|яка|яке|які|чи|можеш|можете|розкажи|розкажіть|поясни|поясніть|опиши|опишіть)(?=\s|[?!,.]|$)/iu;

export const speakerForSource = (source: ListenSource): ListenSpeaker =>
  source === "microphone" ? "You" : "Them";

export const mergeTranscriptTurn = (
  turns: ListenTranscriptTurn[],
  turn: ListenTranscriptTurn,
  limit = 120
): ListenTranscriptTurn[] =>
  [...turns, turn]
    .sort((a, b) => a.capturedAt - b.capturedAt || a.sequence - b.sequence)
    .slice(-limit);

export const formatTranscriptContext = (
  turns: ListenTranscriptTurn[],
  maxChars = 8_000
): string => {
  const lines = turns.map((turn) => `${turn.speaker}: ${turn.text.trim()}`);
  const selected: string[] = [];
  let length = 0;

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    const extra = line.length + (selected.length ? 1 : 0);
    if (selected.length && length + extra > maxChars) break;
    selected.unshift(line.slice(Math.max(0, line.length - maxChars)));
    length += extra;
    if (length >= maxChars) break;
  }

  return selected.join("\n");
};

export const isLikelyQuestion = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized) return false;
  return normalized.includes("?") || QUESTION_START.test(normalized);
};

export const shouldAutoRespond = (
  mode: AutoResponseMode,
  source: ListenSource,
  text: string
): boolean => {
  if (mode === "off") return false;
  if (mode === "pause") return Boolean(text.trim());
  return source === "system" && isLikelyQuestion(text);
};

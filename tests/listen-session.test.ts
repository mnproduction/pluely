import { describe, expect, it } from "vitest";
import {
  formatTranscriptContext,
  isLikelyQuestion,
  mergeTranscriptTurn,
  shouldAutoRespond,
  speakerForSource,
  type ListenTranscriptTurn,
} from "../src/lib/listen-session";

const turn = (
  id: string,
  source: "microphone" | "system",
  text: string,
  capturedAt: number,
  sequence: number
): ListenTranscriptTurn => ({
  id,
  source,
  speaker: speakerForSource(source),
  text,
  capturedAt,
  completedAt: capturedAt + 100,
  sequence,
});

describe("listen session", () => {
  it("keeps turns in capture order when STT requests complete out of order", () => {
    const later = turn("later", "system", "Second", 200, 2);
    const earlier = turn("earlier", "microphone", "First", 100, 1);
    expect(mergeTranscriptTurn(mergeTranscriptTurn([], later), earlier).map((item) => item.id))
      .toEqual(["earlier", "later"]);
  });

  it("labels microphone and system speakers", () => {
    expect(speakerForSource("microphone")).toBe("You");
    expect(speakerForSource("system")).toBe("Them");
  });

  it("builds bounded context from the most recent turns", () => {
    const turns = [
      turn("1", "system", "An old and long statement", 1, 1),
      turn("2", "microphone", "Recent", 2, 2),
    ];
    expect(formatTranscriptContext(turns, 14)).toBe("You: Recent");
  });

  it("detects English and Ukrainian questions without relying only on punctuation", () => {
    expect(isLikelyQuestion("How would you solve this")).toBe(true);
    expect(isLikelyQuestion("Поясніть ваш підхід")).toBe(true);
    expect(isLikelyQuestion("Так, зрозуміло")).toBe(false);
  });

  it("triggers question mode only for the remote speaker", () => {
    expect(shouldAutoRespond("questions", "system", "What would you do?")).toBe(true);
    expect(shouldAutoRespond("questions", "microphone", "What would you do?")).toBe(false);
    expect(shouldAutoRespond("pause", "microphone", "My answer")).toBe(true);
    expect(shouldAutoRespond("off", "system", "Why?")).toBe(false);
  });
});

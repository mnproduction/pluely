// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AudioVisualizer } from "../src/pages/app/components/speech/audio-visualizer";

it("renders silence without generating audio and uses the supplied native peak", () => {
  const render = (isRecording: boolean, peak: number) => {
    const node = document.createElement("div");
    node.innerHTML = renderToStaticMarkup(createElement(AudioVisualizer, { isRecording, peak }));
    return Number(node.querySelector('[role="meter"]')?.getAttribute("aria-valuenow"));
  };
  expect(render(true, 0)).toBe(-60);
  expect(render(true, 0.01)).toBe(-40);
  expect(render(true, 0.1)).toBe(-20);
  expect(render(false, 0.1)).toBe(-60);
  expect(render(true, NaN)).toBe(-60);
});

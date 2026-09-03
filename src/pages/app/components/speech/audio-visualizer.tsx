import { useEffect, useState } from "react";

interface AudioVisualizerProps {
  isRecording: boolean;
  peak?: number;
  stream?: MediaStream | null;
}

// System audio supplies native measurements; microphone recording supplies its real stream.
export function AudioVisualizer({ isRecording, peak, stream }: AudioVisualizerProps) {
  const [microphonePeak, setMicrophonePeak] = useState(0);
  useEffect(() => {
    setMicrophonePeak(0);
    if (!isRecording || !stream) return;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const timer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let value = 0;
      for (const sample of samples) value = Math.max(value, Math.abs(sample));
      setMicrophonePeak(value);
    }, 100);
    void context.resume().catch(() => {});
    return () => { clearInterval(timer); source.disconnect(); void context.close().catch(() => {}); };
  }, [isRecording, stream]);
  const actualPeak = peak ?? microphonePeak;
  const level = isRecording && Number.isFinite(actualPeak) ? Math.max(0, Math.min(1, actualPeak)) : 0;
  const db = level > 0 ? Math.max(-60, 20 * Math.log10(level)) : -60;
  const litBars = Math.round(((db + 60) / 60) * 32);
  return (
    <div role="meter" aria-label="System audio toolbar level" aria-valuemin={-60}
      aria-valuemax={0} aria-valuenow={db} className="flex h-8 w-full items-center gap-1 pl-3">
      {Array.from({ length: 32 }, (_, i) => (
        <span key={i} className={`h-4 flex-1 rounded-sm ${i < litBars ? "bg-emerald-500" : "bg-muted"}`} />
      ))}
    </div>
  );
}

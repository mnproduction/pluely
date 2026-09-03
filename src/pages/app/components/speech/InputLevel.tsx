import type { SystemAudioLevel } from "@/hooks/useSystemAudio";

interface InputLevelProps {
  active: boolean;
  level: SystemAudioLevel | null;
  deviceName: string;
  selectedDeviceName: string;
  isVadMode: boolean;
  isProcessing: boolean;
  isAIProcessing: boolean;
}

export const InputLevel = ({
  active, level, deviceName, selectedDeviceName, isVadMode,
  isProcessing, isAIProcessing,
}: InputLevelProps) => {
  const peak = active ? level?.peak ?? 0 : 0;
  const db = peak > 0 ? Math.max(-60, 20 * Math.log10(peak)) : -60;
  const width = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));
  const hasSignal = peak > 0.0001;
  const outputChanged = active && selectedDeviceName && selectedDeviceName !== deviceName;
  const status = isAIProcessing ? "Generating response..."
    : isProcessing ? "Transcribing..."
    : !active ? (isVadMode ? "Capture stopped" : "Ready to record")
    : !level ? "Checking audio..."
    : !hasSignal ? "No sound detected"
    : isVadMode ? "Sound received. Waiting for a speech pause."
    : "Recording system audio";

  return (
    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium">System Audio input</span>
        <span className="text-muted-foreground tabular-nums">{peak > 0 ? `${Math.round(db)} dB` : "Silent"}</span>
      </div>
      <p className="text-[11px] text-muted-foreground break-words">
        {active ? deviceName : selectedDeviceName || "System default output"}
      </p>
      <div role="meter" aria-label="System audio input level" aria-valuemin={-60} aria-valuemax={0} aria-valuenow={Math.min(0, db)} className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-emerald-500 transition-[width] duration-150" style={{ width: `${width}%` }} />
      </div>
      <p className="text-[11px]">{status}</p>
      {outputChanged ? (
        <p className="text-[11px] text-amber-600">Output changed to {selectedDeviceName}. Stop and restart System Audio to use it.</p>
      ) : active && !isProcessing && !isAIProcessing && level ? (
        <p className="text-[11px] text-muted-foreground">
          {!hasSignal
            ? "Play speech through this output. In Google Meet, select the same Speakers device. Your microphone is separate."
            : isVadMode
              ? "If no text appears, try Settings > Quiet calls, or Manual > Stop & Send to test transcription."
              : "Choose Stop & Send when the speaker finishes."}
        </p>
      ) : null}
    </div>
  );
};

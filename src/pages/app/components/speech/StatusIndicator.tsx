import { AlertCircleIcon, LoaderIcon } from "lucide-react";

type Props = {
  setupRequired: boolean;
  error: string;
  isProcessing: boolean;
  isAIProcessing: boolean;
  capturing: boolean;
  captureActive: boolean;
  hasSignal: boolean;
};

export const StatusIndicator = ({
  setupRequired,
  error,
  isProcessing,
  isAIProcessing,
  capturing,
  captureActive,
  hasSignal,
}: Props) => {
  // Don't show anything if not capturing and no error
  if (!capturing && !error && !isProcessing && !isAIProcessing) {
    return null;
  }

  return (
    <div className="flex flex-1 items-center gap-2 px-3 py-2 justify-end">
      {/* Priority: Error > AI Processing > Transcribing > Listening */}
      {error && !setupRequired ? (
        <div className="flex items-center gap-2 text-red-600">
          <AlertCircleIcon className="w-4 h-4" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      ) : isAIProcessing ? (
        <div className="flex items-center gap-2 animate-pulse">
          <LoaderIcon className="w-4 h-4 animate-spin" />
          <span className="text-xs font-medium">Generating response...</span>
        </div>
      ) : isProcessing ? (
        <div className="flex items-center gap-2 animate-pulse">
          <LoaderIcon className="w-4 h-4 animate-spin" />
          <span className="text-xs font-medium">Transcribing...</span>
        </div>
      ) : capturing ? (
        <div className={`flex items-center gap-2 ${hasSignal ? "text-green-600" : "text-muted-foreground"}`}>
          <div className={`w-2 h-2 rounded-full ${hasSignal ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          <span className="text-xs font-medium">{!captureActive ? "Ready" : hasSignal ? "Audio" : "Silent"}</span>
        </div>
      ) : null}
    </div>
  );
};

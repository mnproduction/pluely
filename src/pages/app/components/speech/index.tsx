import { useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  AudioLinesIcon,
  BotIcon,
  CircleStopIcon,
  HeadphonesIcon,
  LoaderCircleIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SendIcon,
  Settings2Icon,
  SparklesIcon,
  UserRoundIcon,
  XIcon,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import {
  Button,
  CopyButton,
  Markdown,
  Popover,
  PopoverContent,
  PopoverTrigger,
  ScrollArea,
} from "@/components";
import type { useSystemAudioType, SystemAudioLevel } from "@/hooks";
import { cn } from "@/lib/utils";
import { isLikelyQuestion, type AutoResponseMode } from "@/lib/listen-session";
import { PermissionFlow } from "./PermissionFlow";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { ListenMicrophone } from "./ListenMicrophone";
import { SettingsPanel } from "./SettingsPanel";

const formatDuration = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const LevelMeter = ({ level, active, label }: {
  level: SystemAudioLevel | null;
  active: boolean;
  label: string;
}) => {
  const peak = active ? Math.max(0, Math.min(1, level?.peak ?? 0)) : 0;
  const db = peak > 0 ? Math.max(-60, 20 * Math.log10(peak)) : -60;
  const percent = ((db + 60) / 60) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={Math.round(db)}
      className="h-1.5 overflow-hidden rounded-full bg-muted"
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-100", active ? "bg-emerald-500" : "bg-muted-foreground/20")}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
};

export const SystemAudio = (props: useSystemAudioType) => {
  const {
    capturing,
    captureActive,
    audioLevel,
    captureDeviceName,
    isAudioTransitioning,
    isProcessing,
    isAIProcessing,
    lastAIResponse,
    error,
    setupRequired,
    startCapture,
    stopCapture,
    isPopoverOpen,
    setIsPopoverOpen,
    resizeWindow,
    startNewConversation,
    isPaused,
    pauseCapture,
    resumeCapture,
    microphoneActive,
    microphoneSpeaking,
    microphoneLoading,
    microphoneLevel,
    microphoneDeviceName,
    microphoneDeviceId,
    microphoneError,
    handleMicrophoneAudio,
    updateMicrophoneLevel,
    updateMicrophoneStatus,
    transcriptTurns,
    sessionStartedAt,
    autoResponseMode,
    setAutoResponseMode,
    responseQueued,
    suggestResponse,
    vadConfig,
    updateVadConfiguration,
    useSystemPrompt,
    setUseSystemPrompt,
    contextContent,
    setContextContent,
  } = props;
  const [elapsed, setElapsed] = useState(0);
  const [followUp, setFollowUp] = useState("");
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    const update = () => setElapsed(sessionStartedAt ? Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)) : 0);
    update();
    if (!capturing || isPaused) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [capturing, isPaused, sessionStartedAt]);

  const latestQuestion = useMemo(
    () => [...transcriptTurns].reverse().find((turn) => turn.source === "system" && isLikelyQuestion(turn.text)),
    [transcriptTurns]
  );
  const hasPanelContent = Boolean(
    capturing || setupRequired || error || isProcessing || isAIProcessing || transcriptTurns.length || lastAIResponse
  );

  const submitFollowUp = async () => {
    const instruction = followUp.trim();
    await suggestResponse(instruction || "Suggest the best concise response for You to say next.");
    if (instruction) setFollowUp("");
  };

  const openDashboard = () => void invoke("open_dashboard").catch((reason) => console.error("Failed to open dashboard:", reason));

  return (
    <Popover
      open={isPopoverOpen}
      onOpenChange={(open) => {
        if (capturing && !open) return;
        setIsPopoverOpen(open);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          size="icon"
          title={capturing ? "Stop Listen" : "Start Listen"}
          disabled={isAudioTransitioning}
          onClick={() => void (capturing ? stopCapture() : startCapture())}
          className={cn(
            capturing && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
            error && "bg-red-100 text-red-700 hover:bg-red-200"
          )}
        >
          {setupRequired || error ? <AlertCircleIcon /> : isProcessing ? <LoaderCircleIcon className="animate-spin" /> : capturing ? <AudioLinesIcon /> : <HeadphonesIcon />}
        </Button>
      </PopoverTrigger>

      {hasPanelContent && (
        <PopoverContent
          align="start"
          side="bottom"
          sideOffset={8}
          className="h-[638px] w-[calc(100vw-16px)] max-w-none select-none overflow-hidden border-input/60 bg-background/95 p-0 shadow-2xl"
        >
          {capturing && (
            <ListenMicrophone
              key={microphoneDeviceId || "default"}
              paused={isPaused}
              deviceId={microphoneDeviceId}
              onAudio={handleMicrophoneAudio}
              onLevel={updateMicrophoneLevel}
              onStatus={updateMicrophoneStatus}
            />
          )}

          <div className="flex h-full flex-col">
            <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-4">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-xl bg-primary text-primary-foreground"><AudioLinesIcon className="size-4" /></div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Listen</h2>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", isPaused ? "bg-amber-100 text-amber-800" : capturing ? "bg-emerald-100 text-emerald-800" : "bg-muted text-muted-foreground")}>{isPaused ? "Paused" : capturing ? "Live" : "Finished"}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Interview profile · {formatDuration(elapsed)}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="size-8" title="New session" onClick={startNewConversation}><PlusIcon className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" title="Open settings" onClick={openDashboard}><Settings2Icon className="size-4" /></Button>
                {!capturing && <Button size="icon" variant="ghost" className="size-8" title="Close" onClick={() => { setIsPopoverOpen(false); resizeWindow(false); }}><XIcon className="size-4" /></Button>}
              </div>
            </header>

            {setupRequired ? (
              <div className="p-5"><PermissionFlow onPermissionGranted={() => void startCapture()} onPermissionDenied={() => {}} /></div>
            ) : (
              <>
                <section className="grid shrink-0 grid-cols-2 gap-3 border-b border-border/70 bg-muted/20 px-4 py-3">
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2"><MicIcon className="size-4 text-sky-600" /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">You · Microphone</p><p className="truncate text-xs">{microphoneDeviceName}</p></div></div>
                      <span className={cn("size-2 rounded-full", microphoneError ? "bg-red-500" : microphoneActive && !isPaused ? "bg-emerald-500" : microphoneLoading ? "animate-pulse bg-amber-500" : "bg-muted-foreground/30")} />
                    </div>
                    <LevelMeter level={microphoneLevel} active={microphoneActive && !isPaused} label="Microphone level" />
                    {microphoneError && <p className="mt-1 truncate text-[10px] text-red-600" title={microphoneError}>Microphone unavailable</p>}
                  </div>
                  <div className="rounded-xl border bg-background/80 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2"><HeadphonesIcon className="size-4 text-violet-600" /><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Them · System audio</p><p className="truncate text-xs">{captureDeviceName || "System default output"}</p></div></div>
                      <span className={cn("size-2 rounded-full", captureActive && !isPaused ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                    </div>
                    <LevelMeter level={audioLevel} active={captureActive && !isPaused} label="System audio level" />
                  </div>
                </section>

                {(error || microphoneError) && (
                  <div className="mx-4 mt-3 flex shrink-0 items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-800"><AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" /><span>{error || `Microphone: ${microphoneError}`}</span></div>
                )}

                <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.04fr)_minmax(0,.96fr)] gap-3 p-4">
                  <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-muted/10">
                    <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                      <div><h3 className="text-xs font-semibold">Live transcript</h3><p className="text-[9px] text-muted-foreground">{transcriptTurns.length} segments</p></div>
                      {isProcessing && <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><LoaderCircleIcon className="size-3 animate-spin" />Transcribing</span>}
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="space-y-3 p-3">
                        {transcriptTurns.length === 0 ? (
                          <div className="flex min-h-52 flex-col items-center justify-center text-center text-muted-foreground"><AudioLinesIcon className="mb-2 size-6 opacity-40" /><p className="text-xs">Conversation will appear here</p><p className="mt-1 text-[10px]">Both channels are transcribed independently</p></div>
                        ) : transcriptTurns.map((turn) => (
                          <article key={turn.id} className="grid grid-cols-[64px_1fr] gap-2 text-xs">
                            <div className={cn("flex items-start gap-1.5 font-semibold", turn.source === "microphone" ? "text-sky-700" : "text-violet-700")}>{turn.source === "microphone" ? <UserRoundIcon className="mt-0.5 size-3" /> : <HeadphonesIcon className="mt-0.5 size-3" />}{turn.speaker}</div>
                            <p className="select-text leading-relaxed text-foreground/90">{turn.text}</p>
                          </article>
                        ))}
                      </div>
                    </ScrollArea>
                  </section>

                  <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border bg-background">
                    <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
                      <div className="flex items-center gap-2"><SparklesIcon className="size-3.5 text-primary" /><h3 className="text-xs font-semibold">Suggested response</h3></div>
                      {lastAIResponse && <CopyButton content={lastAIResponse} />}
                    </div>
                    <ScrollArea className="min-h-0 flex-1">
                      <div className="p-4">
                        {latestQuestion && <div className="mb-4 rounded-xl bg-violet-50 px-3 py-2 dark:bg-violet-950/30"><p className="mb-1 text-[9px] font-semibold uppercase tracking-wide text-violet-700 dark:text-violet-300">Latest question</p><p className="select-text text-xs leading-relaxed">{latestQuestion.text}</p></div>}
                        {isAIProcessing && !lastAIResponse ? (
                          <div className="flex min-h-44 flex-col items-center justify-center text-muted-foreground"><LoaderCircleIcon className="mb-2 size-6 animate-spin text-primary" /><p className="text-xs">Preparing your response</p></div>
                        ) : lastAIResponse ? (
                          <div className="select-text text-sm leading-relaxed"><Markdown isStreaming={isAIProcessing}>{lastAIResponse}</Markdown>{responseQueued && <p className="mt-3 text-[10px] text-muted-foreground">One newer request is queued</p>}</div>
                        ) : (
                          <div className="flex min-h-44 flex-col items-center justify-center text-center text-muted-foreground"><BotIcon className="mb-2 size-6 opacity-40" /><p className="text-xs">A suggested answer will appear here</p><p className="mt-1 max-w-56 text-[10px]">Ask manually or let Mira respond when the other speaker asks a question</p></div>
                        )}
                      </div>
                    </ScrollArea>
                  </section>
                </main>

                <section className="shrink-0 border-t bg-muted/10 px-4 py-3">
                  <div className="mb-2 flex items-center gap-2">
                    <input
                      value={followUp}
                      onChange={(event) => setFollowUp(event.target.value)}
                      onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitFollowUp(); } }}
                      placeholder="Ask Mira about this conversation..."
                      className="h-9 min-w-0 flex-1 rounded-xl border bg-background px-3 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
                    />
                    <Button size="icon" className="size-9" title="Send follow-up" disabled={!transcriptTurns.length || isAudioTransitioning} onClick={() => void submitFollowUp()}><SendIcon className="size-4" /></Button>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
                      <span className={cn("size-2 rounded-full", microphoneSpeaking || (captureActive && (audioLevel?.peak ?? 0) > 0.002) ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/30")} />
                      <span className="truncate">{isPaused ? "Capture paused" : isAIProcessing ? "Generating response" : isProcessing ? "Transcribing speech" : capturing ? "Listening to both channels" : "Session finished"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select aria-label="Automatic response mode" value={autoResponseMode} onChange={(event) => setAutoResponseMode(event.target.value as AutoResponseMode)} className="h-8 rounded-xl border bg-background px-2 text-[10px] outline-none">
                        <option value="questions">Auto: questions</option><option value="pause">Auto: every pause</option><option value="off">Auto: off</option>
                      </select>
                      <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!transcriptTurns.length || isAudioTransitioning} onClick={() => void suggestResponse()}><SparklesIcon className="size-3.5" />Suggest</Button>
                      {capturing && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={isAudioTransitioning} onClick={() => void (isPaused ? resumeCapture() : pauseCapture())}>{isPaused ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}{isPaused ? "Resume" : "Pause"}</Button>}
                      {capturing && <Button size="sm" variant="destructive" className="h-8 text-xs" disabled={isAudioTransitioning} onClick={() => void stopCapture()}><CircleStopIcon className="size-3.5" />Stop</Button>}
                      <Button size="icon" variant="ghost" className="size-8" title="Session settings and diagnostics" onClick={() => setShowDiagnostics((value) => !value)}><Settings2Icon className="size-3.5" /></Button>
                    </div>
                  </div>
                  {showDiagnostics && <div className="mt-3 grid max-h-72 grid-cols-2 gap-2 overflow-y-auto pr-1">
                    <SettingsPanel
                      vadConfig={vadConfig}
                      onUpdateVadConfig={updateVadConfiguration}
                      useSystemPrompt={useSystemPrompt}
                      setUseSystemPrompt={setUseSystemPrompt}
                      contextContent={contextContent}
                      setContextContent={setContextContent}
                    />
                    <DiagnosticsPanel />
                  </div>}
                </section>
              </>
            )}
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
};

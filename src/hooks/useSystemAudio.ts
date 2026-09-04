import { useEffect, useState, useCallback, useRef } from "react";
import { useWindowResize, useGlobalShortcuts } from ".";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useApp } from "@/contexts";
import { fetchSTT, fetchAIResponse } from "@/lib/functions";
import {
  DEFAULT_QUICK_ACTIONS,
  DEFAULT_SYSTEM_PROMPT,
  STORAGE_KEYS,
} from "@/config";
import {
  safeLocalStorage,
  generateConversationTitle,
  saveConversation,
  CONVERSATION_SAVE_DEBOUNCE_MS,
  generateConversationId,
  generateMessageId,
} from "@/lib";
import { Message } from "@/types/completion";
import {
  formatTranscriptContext,
  mergeTranscriptTurn,
  shouldAutoRespond,
  speakerForSource,
  type AutoResponseMode,
  type ListenSource,
  type ListenTranscriptTurn,
} from "@/lib/listen-session";
import type { MicrophoneCaptureStatus } from "@/lib/microphone";

// VAD Configuration interface matching Rust
export interface VadConfig {
  enabled: boolean;
  hop_size: number;
  sensitivity_rms: number;
  peak_threshold: number;
  silence_chunks: number;
  min_speech_chunks: number;
  pre_speech_chunks: number;
  noise_gate_threshold: number;
  max_recording_duration_secs: number;
}

export interface SystemAudioLevel {
  rms: number;
  peak: number;
  samples: number;
}

// OPTIMIZED VAD defaults - matches backend exactly for perfect performance
const DEFAULT_VAD_CONFIG: VadConfig = {
  enabled: true,
  hop_size: 1024,
  sensitivity_rms: 0.012, // Much less sensitive - only real speech
  peak_threshold: 0.035, // Higher threshold - filters clicks/noise
  silence_chunks: 45, // ~1.0s of required silence
  min_speech_chunks: 7, // ~0.16s - captures short answers
  pre_speech_chunks: 12, // ~0.27s - enough to catch word start
  noise_gate_threshold: 0.003, // Stronger noise filtering
  max_recording_duration_secs: 180, // 3 minutes default
};

// Chat message interface (reusing from useCompletion)
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

// Conversation interface (reusing from useCompletion)
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type useSystemAudioType = ReturnType<typeof useSystemAudio>;

export function useSystemAudio() {
  const { resizeWindow } = useWindowResize();
  const globalShortcuts = useGlobalShortcuts();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [captureActive, setCaptureActive] = useState(false);
  const [audioLevel, setAudioLevel] = useState<SystemAudioLevel | null>(null);
  const [captureDeviceName, setCaptureDeviceName] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isAIProcessing, setIsAIProcessing] = useState(false);
  const [lastTranscription, setLastTranscription] = useState<string>("");
  const [lastAIResponse, setLastAIResponse] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [setupRequired, setSetupRequired] = useState<boolean>(false);
  const [quickActions, setQuickActions] = useState<string[]>([]);
  const [isManagingQuickActions, setIsManagingQuickActions] =
    useState<boolean>(false);
  const [showQuickActions, setShowQuickActions] = useState<boolean>(true);
  const [vadConfig, setVadConfig] = useState<VadConfig>(DEFAULT_VAD_CONFIG);
  const [recordingProgress, setRecordingProgress] = useState<number>(0); // For continuous mode
  const [isContinuousMode, setIsContinuousMode] = useState<boolean>(false);
  const [isRecordingInContinuousMode, setIsRecordingInContinuousMode] =
    useState<boolean>(false);
  const [isAudioTransitioning, setIsAudioTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [microphoneActive, setMicrophoneActive] = useState(false);
  const [microphoneSpeaking, setMicrophoneSpeaking] = useState(false);
  const [microphoneLoading, setMicrophoneLoading] = useState(false);
  const [microphoneLevel, setMicrophoneLevel] = useState<SystemAudioLevel | null>(null);
  const [microphoneError, setMicrophoneError] = useState("");
  const [transcriptTurns, setTranscriptTurns] = useState<ListenTranscriptTurn[]>([]);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [autoResponseMode, setAutoResponseModeState] = useState<AutoResponseMode>("questions");
  const [responseQueued, setResponseQueued] = useState(false);
  const audioTransitionRef = useRef(false);
  const recordingRef = useRef(false);
  const sessionActiveRef = useRef(false);
  const pausedRef = useRef(false);
  const pendingSttRef = useRef(0);
  const microphoneLevelRef = useRef<SystemAudioLevel | null>(null);
  const microphoneDiagnosticsRef = useRef<MicrophoneCaptureStatus>({
    active: false,
    speaking: false,
    loading: false,
    error: "",
    samplesReceived: 0,
    lastFrameAt: 0,
    streamInfo: null,
  });
  const sessionGenerationRef = useRef(0);
  const turnSequenceRef = useRef(0);
  const transcriptTurnsRef = useRef<ListenTranscriptTurn[]>([]);
  const generationActiveRef = useRef(false);
  const queuedGenerationRef = useRef<{
    text: string;
    prompt: string;
    previousMessages: Message[];
    source: ListenSource;
  } | null>(null);
  const processWithAIRef = useRef<((
    text: string,
    prompt: string,
    previousMessages: Message[],
    source?: ListenSource
  ) => Promise<void>) | null>(null);
  const transcribeAudioRef = useRef<((source: ListenSource, audio: Blob, capturedAt: number) => Promise<void>) | null>(null);

  // Refs also guard two clicks/keypresses before React has rendered again.
  const beginAudioTransition = useCallback(() => {
    if (audioTransitionRef.current) return false;
    audioTransitionRef.current = true;
    setIsAudioTransitioning(true);
    return true;
  }, []);
  const endAudioTransition = useCallback(() => {
    audioTransitionRef.current = false;
    setIsAudioTransitioning(false);
  }, []);

  const [conversation, setConversation] = useState<ChatConversation>({
    id: "",
    title: "",
    messages: [],
    createdAt: 0,
    updatedAt: 0,
  });

  // Context management states
  const [useSystemPrompt, setUseSystemPrompt] = useState<boolean>(true);
  const [contextContent, setContextContent] = useState<string>("");

  const {
    selectedSttProvider,
    allSttProviders,
    selectedAIProvider,
    allAiProviders,
    systemPrompt,
    selectedAudioDevices,
  } = useApp();
  const abortControllerRef = useRef<AbortController | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef<boolean>(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Report state/counts only. Neither prompts, responses nor provider values leave this window.
  useEffect(() => {
    const report = () => {
      const systemTurns = transcriptTurns.filter((turn) => turn.source === "system").length;
      const microphoneTurns = transcriptTurns.length - systemTurns;
      void invoke("diagnostics_record_pipeline", { update: {
        panel_open: isPopoverOpen, capture_enabled: capturing, capture_active: captureActive,
        system_capture_active: captureActive, microphone_capture_active: microphoneActive,
        microphone_speaking: microphoneSpeaking, microphone_rms: microphoneLevelRef.current?.rms ?? 0,
        microphone_peak: microphoneLevelRef.current?.peak ?? 0,
        microphone_stream_active: microphoneDiagnosticsRef.current.streamInfo?.streamActive ?? false,
        microphone_track_live: microphoneDiagnosticsRef.current.streamInfo?.trackLive ?? false,
        microphone_track_muted: microphoneDiagnosticsRef.current.streamInfo?.trackMuted ?? false,
        microphone_track_enabled: microphoneDiagnosticsRef.current.streamInfo?.trackEnabled ?? false,
        microphone_samples_received: microphoneDiagnosticsRef.current.samplesReceived,
        microphone_last_frame_at_ms: microphoneDiagnosticsRef.current.lastFrameAt,
        microphone_sample_rate: microphoneDiagnosticsRef.current.streamInfo?.sampleRate ?? 0,
        microphone_channel_count: microphoneDiagnosticsRef.current.streamInfo?.channelCount ?? 0,
        microphone_device_selection: microphoneDiagnosticsRef.current.streamInfo?.selectionMode ?? "unavailable",
        microphone_audio_processor: "script_processor",
        paused: isPaused,
        recording: isRecordingInContinuousMode, transcribing: isProcessing, generating: isAIProcessing,
        response_queued: responseQueued,
        stt_configured: Boolean(selectedSttProvider.provider), ai_configured: Boolean(selectedAIProvider.provider),
        transcript_chars: transcriptTurns.reduce((total, turn) => total + turn.text.length, 0),
        transcript_turns: transcriptTurns.length, system_turns: systemTurns, microphone_turns: microphoneTurns,
        response_chars: lastAIResponse.length, has_error: Boolean(error || microphoneError), auto_response_mode: autoResponseMode,
      } }).catch(() => {});
    };
    const timer = setTimeout(report, 200);
    const heartbeat = setInterval(report, 2000);
    return () => { clearTimeout(timer); clearInterval(heartbeat); };
  }, [isPopoverOpen, capturing, captureActive, microphoneActive, microphoneSpeaking,
    isPaused, isRecordingInContinuousMode, isProcessing, isAIProcessing, responseQueued,
    selectedSttProvider.provider, selectedAIProvider.provider, transcriptTurns, lastAIResponse.length, error, microphoneError,
    autoResponseMode]);

  // Load context settings and VAD config from localStorage on mount
  useEffect(() => {
    const savedContext = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT
    );
    if (savedContext) {
      try {
        const parsed = JSON.parse(savedContext);
        setUseSystemPrompt(parsed.useSystemPrompt ?? true);
        setContextContent(parsed.contextContent ?? "");
      } catch (error) {
        console.error("Failed to load system audio context:", error);
      }
    }

    // Load VAD config
    const savedVadConfig = safeLocalStorage.getItem("vad_config");
    if (savedVadConfig) {
      try {
        const parsed = JSON.parse(savedVadConfig);
        setVadConfig(parsed);
      } catch (error) {
        console.error("Failed to load VAD config:", error);
      }
    }

    const savedAutoMode = safeLocalStorage.getItem("listen_auto_response_mode");
    if (savedAutoMode === "questions" || savedAutoMode === "pause" || savedAutoMode === "off") {
      setAutoResponseModeState(savedAutoMode);
    }
  }, []);

  // Load quick actions from localStorage on mount
  useEffect(() => {
    const savedActions = safeLocalStorage.getItem(
      STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS
    );
    if (savedActions) {
      try {
        const parsed = JSON.parse(savedActions);
        setQuickActions(parsed);
      } catch (error) {
        console.error("Failed to load quick actions:", error);
        setQuickActions(DEFAULT_QUICK_ACTIONS);
      }
    } else {
      setQuickActions(DEFAULT_QUICK_ACTIONS);
    }
  }, []);

  // Handle continuous recording progress events AND error events
  useEffect(() => {
    let progressUnlisten: (() => void) | undefined;
    let startUnlisten: (() => void) | undefined;
    let stopUnlisten: (() => void) | undefined;
    let errorUnlisten: (() => void) | undefined;
    let discardedUnlisten: (() => void) | undefined;
    let levelUnlisten: (() => void) | undefined;
    let captureStartUnlisten: (() => void) | undefined;
    let captureStopUnlisten: (() => void) | undefined;
    let disposed = false;
    const register = async (name: string, handler: (event: { payload: unknown }) => void) => {
      const unlisten = await listen(name, (event) => { if (!disposed) handler(event); });
      if (disposed) unlisten();
      return unlisten;
    };

    const setupContinuousListeners = async () => {
      try {
        levelUnlisten = await register("system-audio-level", (event) => {
          setAudioLevel(event.payload as SystemAudioLevel);
        });
        captureStartUnlisten = await register("capture-started", () => {
          setCaptureActive(true);
          setAudioLevel(null);
        });
        captureStopUnlisten = await register("capture-stopped", () => {
          setCaptureActive(false);
          setAudioLevel(null);
        });
        // Progress updates (every second)
        progressUnlisten = await register("recording-progress", (event) => {
          const seconds = event.payload as number;
          setRecordingProgress(seconds);
        });

        // Recording started
        startUnlisten = await register("continuous-recording-start", () => {
          recordingRef.current = true;
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(true);
        });

        // Recording stopped
        stopUnlisten = await register("continuous-recording-stopped", () => {
          recordingRef.current = false;
          setRecordingProgress(0);
          setIsRecordingInContinuousMode(false);
        });

        // Audio encoding errors
        errorUnlisten = await register("audio-encoding-error", (event) => {
          const errorMsg = event.payload as string;
          console.error("Audio encoding error:", errorMsg);
          setError(`Failed to process audio: ${errorMsg}`);
          setIsProcessing(pendingSttRef.current > 0);
          setIsRecordingInContinuousMode(false);
        });

        // Speech discarded (too short)
        discardedUnlisten = await register("speech-discarded", (event) => {
          const reason = event.payload as string;
          console.log("Speech discarded:", reason);
          // Don't show error - this is expected behavior
        });
      } catch (err) {
        console.error("Failed to setup continuous recording listeners:", err);
      }
    };

    setupContinuousListeners();

    return () => {
      disposed = true;
      if (progressUnlisten) progressUnlisten();
      if (startUnlisten) startUnlisten();
      if (stopUnlisten) stopUnlisten();
      if (errorUnlisten) errorUnlisten();
      if (discardedUnlisten) discardedUnlisten();
      if (levelUnlisten) levelUnlisten();
      if (captureStartUnlisten) captureStartUnlisten();
      if (captureStopUnlisten) captureStopUnlisten();
    };
  }, []);

  // Native system audio is transcribed through the same session pipeline as the microphone.
  useEffect(() => {
    let speechUnlisten: (() => void) | undefined;
    let disposed = false;

    const setupEventListener = async () => {
      try {
        speechUnlisten = await listen("speech-detected", (event) => {
          try {
            if (disposed || !sessionActiveRef.current || pausedRef.current) return;

            const base64Audio = event.payload as string;
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            void transcribeAudioRef.current?.(
              "system",
              new Blob([bytes], { type: "audio/wav" }),
              Date.now()
            );
          } catch (err) {
            setError("Failed to process speech");
          }
        });
        if (disposed) speechUnlisten();
      } catch (err) {
        setError("Failed to setup speech listener");
      }
    };

    setupEventListener();

    return () => {
      disposed = true;
      if (speechUnlisten) speechUnlisten();
    };
  }, []);

  // Context management functions
  const saveContextSettings = useCallback(
    (usePrompt: boolean, content: string) => {
      try {
        const contextSettings = {
          useSystemPrompt: usePrompt,
          contextContent: content,
        };
        safeLocalStorage.setItem(
          STORAGE_KEYS.SYSTEM_AUDIO_CONTEXT,
          JSON.stringify(contextSettings)
        );
      } catch (error) {
        console.error("Failed to save context settings:", error);
      }
    },
    []
  );

  const updateUseSystemPrompt = useCallback(
    (value: boolean) => {
      setUseSystemPrompt(value);
      saveContextSettings(value, contextContent);
    },
    [contextContent, saveContextSettings]
  );

  const updateContextContent = useCallback(
    (content: string) => {
      setContextContent(content);
      saveContextSettings(useSystemPrompt, content);
    },
    [useSystemPrompt, saveContextSettings]
  );

  // Quick actions management
  const saveQuickActions = useCallback((actions: string[]) => {
    try {
      safeLocalStorage.setItem(
        STORAGE_KEYS.SYSTEM_AUDIO_QUICK_ACTIONS,
        JSON.stringify(actions)
      );
    } catch (error) {
      console.error("Failed to save quick actions:", error);
    }
  }, []);

  const addQuickAction = useCallback(
    (action: string) => {
      if (action && !quickActions.includes(action)) {
        const newActions = [...quickActions, action];
        setQuickActions(newActions);
        saveQuickActions(newActions);
      }
    },
    [quickActions, saveQuickActions]
  );

  const removeQuickAction = useCallback(
    (action: string) => {
      const newActions = quickActions.filter((a) => a !== action);
      setQuickActions(newActions);
      saveQuickActions(newActions);
    },
    [quickActions, saveQuickActions]
  );

  const handleQuickActionClick = async (action: string) => {
    setError("");

    const effectiveSystemPrompt = useSystemPrompt
      ? systemPrompt || DEFAULT_SYSTEM_PROMPT
      : contextContent || DEFAULT_SYSTEM_PROMPT;

    // Include the most recent transcription in conversation history if it exists
    let updatedMessages = [...conversation.messages];

    if (lastTranscription && lastTranscription.trim()) {
      const lastMessage = updatedMessages[updatedMessages.length - 1];
      // Only add if it's not already the last message
      if (!lastMessage || lastMessage.content !== lastTranscription) {
        const timestamp = Date.now();
        const userMessage = {
          id: generateMessageId("user", timestamp),
          role: "user" as const,
          content: lastTranscription,
          timestamp,
        };
        updatedMessages.push(userMessage);

        // Update conversation state with the latest transcription
        setConversation((prev) => ({
          ...prev,
          messages: [userMessage, ...prev.messages],
          updatedAt: timestamp,
          title: prev.title || generateConversationTitle(lastTranscription),
        }));
      }
    }

    const previousMessages = updatedMessages.map((msg) => {
      return { role: msg.role, content: msg.content };
    });

    await processWithAI(action, effectiveSystemPrompt, previousMessages);
  };

  // Start continuous recording manually
  const startContinuousRecording = useCallback(async () => {
    if (!capturing || vadConfig.enabled || recordingRef.current || !beginAudioTransition()) return;
    try {
      recordingRef.current = true;
      setRecordingProgress(0);
      setError("");

      const deviceId =
        selectedAudioDevices.output.id !== "default"
          ? selectedAudioDevices.output.id
          : null;

      // Start a new continuous recording session
      setCaptureDeviceName(selectedAudioDevices.output.name || "System default output");
      await invoke<string>("start_system_audio_capture", {
        vadConfig: vadConfig,
        deviceId: deviceId,
      });
    } catch (err) {
      recordingRef.current = false;
      setIsRecordingInContinuousMode(false);
      console.error("Failed to start continuous recording:", err);
      setError(`Failed to start recording: ${err}`);
    } finally {
      endAudioTransition();
    }
  }, [capturing, vadConfig, selectedAudioDevices.output.id, selectedAudioDevices.output.name, beginAudioTransition, endAudioTransition]);

  // Ignore current recording (stop without transcription)
  const ignoreContinuousRecording = useCallback(async () => {
    if (!isContinuousMode || !recordingRef.current || !beginAudioTransition()) return;
    try {

      // Stop the capture without processing
      await invoke<string>("stop_system_audio_capture");

      // Reset states
      setRecordingProgress(0);
      recordingRef.current = false;
      setIsProcessing(false);
      setIsRecordingInContinuousMode(false);
    } catch (err) {
      console.error("Failed to ignore recording:", err);
      setError(`Failed to ignore recording: ${err}`);
    } finally {
      endAudioTransition();
    }
  }, [isContinuousMode, beginAudioTransition, endAudioTransition]);

  // AI Processing function
  const processWithAI = useCallback(
    async (
      transcription: string,
      prompt: string,
      previousMessages: Message[],
      source: ListenSource = "system"
    ) => {
      if (generationActiveRef.current) {
        queuedGenerationRef.current = { text: transcription, prompt, previousMessages, source };
        setResponseQueued(true);
        return;
      }

      generationActiveRef.current = true;
      const requestController = new AbortController();
      abortControllerRef.current = requestController;

      try {
        setIsAIProcessing(true);
        setLastAIResponse("");
        setError("");

        let fullResponse = "";

        const provider = allAiProviders.find(
          (p) => p.id === selectedAIProvider.provider
        );

        for await (const chunk of fetchAIResponse({
          provider,
          selectedProvider: selectedAIProvider,
          systemPrompt: prompt,
          history: previousMessages,
          userMessage: transcription,
          imagesBase64: [],
          signal: requestController.signal,
          source,
        })) {
          if (requestController.signal.aborted) return;
          fullResponse += chunk;
          setLastAIResponse((prev) => prev + chunk);
        }
        if (requestController.signal.aborted) return;
        if (!fullResponse.trim()) throw new Error("The AI provider returned no answer text. Check AI settings and retry.");

        if (fullResponse) {
          const timestamp = Date.now();
          setConversation((prev) => ({
            ...prev,
            messages: [
              {
                id: generateMessageId("user", timestamp),
                role: "user" as const,
                content: transcription,
                timestamp,
              },
              {
                id: generateMessageId("assistant", timestamp + 1),
                role: "assistant" as const,
                content: fullResponse,
                timestamp: timestamp + 1,
              },
              ...prev.messages,
            ],
            updatedAt: timestamp,
            title: prev.title || generateConversationTitle(transcription),
          }));
        }
      } catch (err) {
        if (!requestController.signal.aborted) {
          setError(err instanceof Error ? err.message : "Failed to get AI response");
          setIsPopoverOpen(true);
        }
      } finally {
        if (abortControllerRef.current === requestController) {
          abortControllerRef.current = null;
          generationActiveRef.current = false;
          setIsAIProcessing(false);
          const queued = queuedGenerationRef.current;
          queuedGenerationRef.current = null;
          setResponseQueued(false);
          if (queued && !requestController.signal.aborted) {
            setTimeout(() => {
              void processWithAIRef.current?.(
                queued.text,
                queued.prompt,
                queued.previousMessages,
                queued.source
              );
            }, 0);
          }
        }
      }
    },
    [selectedAIProvider, allAiProviders]
  );

  processWithAIRef.current = processWithAI;

  const transcribeAudio = useCallback(async (
    source: ListenSource,
    audio: Blob,
    capturedAt: number
  ) => {
    const sessionGeneration = sessionGenerationRef.current;
    const providerConfig = allSttProviders.find(
      (provider) => provider.id === selectedSttProvider.provider
    );
    pendingSttRef.current += 1;
    setIsProcessing(true);

    try {
      const transcription = await fetchSTT({
        provider: providerConfig,
        selectedProvider: selectedSttProvider,
        audio,
        source,
      });
      if (sessionGeneration !== sessionGenerationRef.current) return;
      const text = transcription.trim();
      if (!text) {
        if (source === "system") {
          setError("No speech was recognized. Check the System Audio level and the meeting speaker device.");
          setIsPopoverOpen(true);
        }
        return;
      }

      const turn: ListenTranscriptTurn = {
        id: crypto.randomUUID(),
        source,
        speaker: speakerForSource(source),
        text,
        capturedAt,
        completedAt: Date.now(),
        sequence: ++turnSequenceRef.current,
      };
      const nextTurns = mergeTranscriptTurn(transcriptTurnsRef.current, turn);
      transcriptTurnsRef.current = nextTurns;
      setTranscriptTurns(nextTurns);
      setLastTranscription(text);
      setError("");

      if (shouldAutoRespond(autoResponseMode, source, text)) {
        const effectiveSystemPrompt = useSystemPrompt
          ? systemPrompt || DEFAULT_SYSTEM_PROMPT
          : contextContent || DEFAULT_SYSTEM_PROMPT;
        const context = formatTranscriptContext(nextTurns);
        const request = `Live conversation transcript:\n${context}\n\nSuggest the best concise response for You to say next.`;
        const previousMessages = conversation.messages.map(({ role, content }) => ({ role, content }));
        void processWithAI(request, effectiveSystemPrompt, previousMessages, source);
      }
    } catch (sttError) {
      if (sessionGeneration !== sessionGenerationRef.current) return;
      console.error("STT Error:", sttError);
      setError(sttError instanceof Error ? sttError.message : "Failed to transcribe audio");
      setIsPopoverOpen(true);
    } finally {
      if (sessionGeneration === sessionGenerationRef.current) {
        pendingSttRef.current = Math.max(0, pendingSttRef.current - 1);
        setIsProcessing(pendingSttRef.current > 0);
      }
    }
  }, [
    allSttProviders,
    selectedSttProvider,
    autoResponseMode,
    useSystemPrompt,
    systemPrompt,
    contextContent,
    conversation.messages,
    processWithAI,
  ]);

  transcribeAudioRef.current = transcribeAudio;

  const handleMicrophoneAudio = useCallback((audio: Blob, capturedAt: number) => {
    if (!sessionActiveRef.current || pausedRef.current) return;
    void transcribeAudioRef.current?.("microphone", audio, capturedAt);
  }, []);

  const updateMicrophoneLevel = useCallback((level: SystemAudioLevel | null) => {
    microphoneLevelRef.current = level;
    setMicrophoneLevel(level);
  }, []);

  const updateMicrophoneStatus = useCallback((status: MicrophoneCaptureStatus) => {
    microphoneDiagnosticsRef.current = status;
    setMicrophoneActive(status.active);
    setMicrophoneSpeaking(status.speaking);
    setMicrophoneLoading(status.loading);
    setMicrophoneError(status.error);
  }, []);

  const setAutoResponseMode = useCallback((mode: AutoResponseMode) => {
    setAutoResponseModeState(mode);
    safeLocalStorage.setItem("listen_auto_response_mode", mode);
  }, []);

  const suggestResponse = useCallback(async (instruction = "Suggest the best concise response for You to say next.") => {
    const context = formatTranscriptContext(transcriptTurnsRef.current);
    if (!context) {
      setError("No transcript is available yet.");
      setIsPopoverOpen(true);
      return;
    }
    const effectiveSystemPrompt = useSystemPrompt
      ? systemPrompt || DEFAULT_SYSTEM_PROMPT
      : contextContent || DEFAULT_SYSTEM_PROMPT;
    const request = `Live conversation transcript:\n${context}\n\n${instruction}`;
    const previousMessages = conversation.messages.map(({ role, content }) => ({ role, content }));
    const source = transcriptTurnsRef.current[transcriptTurnsRef.current.length - 1]?.source ?? "system";
    await processWithAI(request, effectiveSystemPrompt, previousMessages, source);
  }, [useSystemPrompt, systemPrompt, contextContent, conversation.messages, processWithAI]);

  const startCapture = useCallback(async () => {
    if (!beginAudioTransition()) return;
    try {
      setError("");

      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (!hasAccess) {
        setSetupRequired(true);
        setIsPopoverOpen(true);
        return;
      }

      const liveVadConfig = vadConfig.enabled ? vadConfig : { ...vadConfig, enabled: true };
      if (!vadConfig.enabled) {
        setVadConfig(liveVadConfig);
        safeLocalStorage.setItem("vad_config", JSON.stringify(liveVadConfig));
      }
      // Release any previous native session before starting both Listen channels.
      await invoke("stop_system_audio_capture");
      recordingRef.current = false;

      if (abortControllerRef.current) abortControllerRef.current.abort();
      queuedGenerationRef.current = null;
      generationActiveRef.current = false;
      setResponseQueued(false);

      // Set up conversation
      const conversationId = generateConversationId("sysaudio");
      setConversation({
        id: conversationId,
        title: "",
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });

      transcriptTurnsRef.current = [];
      sessionGenerationRef.current += 1;
      turnSequenceRef.current = 0;
      pendingSttRef.current = 0;
      setTranscriptTurns([]);
      setLastTranscription("");
      setLastAIResponse("");
      setMicrophoneError("");
      microphoneLevelRef.current = null;
      setMicrophoneLevel(null);
      setIsPaused(false);
      pausedRef.current = false;
      sessionActiveRef.current = true;
      setSessionStartedAt(Date.now());
      setCapturing(true);
      setIsPopoverOpen(true);
      setIsContinuousMode(false);
      setRecordingProgress(0);
      setIsRecordingInContinuousMode(false);

      // VAD mode: Start recording immediately
      const deviceId =
        selectedAudioDevices.output.id !== "default"
          ? selectedAudioDevices.output.id
          : null;

      // Start capture with VAD config
      setCaptureDeviceName(selectedAudioDevices.output.name || "System default output");
      await invoke<string>("start_system_audio_capture", {
        vadConfig: liveVadConfig,
        deviceId: deviceId,
      });
    } catch (err) {
      sessionActiveRef.current = false;
      setCapturing(false);
      setIsContinuousMode(false);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
      setIsPopoverOpen(true);
    } finally {
      endAudioTransition();
    }
  }, [vadConfig, selectedAudioDevices.output.id, selectedAudioDevices.output.name, beginAudioTransition, endAudioTransition]);

  const stopCapture = useCallback(async () => {
    if (!beginAudioTransition()) return;
    try {
      // Stop the audio capture
      await invoke<string>("stop_system_audio_capture");

      // Stop capture without deleting the completed transcript or answer.
      // Pending transcription and generation may finish after capture stops.
      sessionActiveRef.current = false;
      pausedRef.current = false;
      setCapturing(false);
      setIsPaused(false);
      setMicrophoneActive(false);
      setMicrophoneSpeaking(false);
      microphoneLevelRef.current = null;
      setMicrophoneLevel(null);
      recordingRef.current = false;
      setIsContinuousMode(false);
      setIsRecordingInContinuousMode(false);
      setRecordingProgress(0);
      setIsPopoverOpen(Boolean(transcriptTurnsRef.current.length || lastAIResponse || error || pendingSttRef.current || generationActiveRef.current));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stop capture: ${errorMessage}`);
      console.error("Stop capture error:", err);
    } finally {
      endAudioTransition();
    }
  }, [beginAudioTransition, endAudioTransition, lastAIResponse, error]);

  const pauseCapture = useCallback(async () => {
    if (!capturing || isPaused || !beginAudioTransition()) return;
    try {
      pausedRef.current = true;
      setIsPaused(true);
      microphoneLevelRef.current = null;
      setMicrophoneLevel(null);
      await invoke<string>("stop_system_audio_capture");
    } catch (err) {
      pausedRef.current = false;
      setIsPaused(false);
      setError(`Failed to pause Listen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      endAudioTransition();
    }
  }, [capturing, isPaused, beginAudioTransition, endAudioTransition]);

  const resumeCapture = useCallback(async () => {
    if (!capturing || !isPaused || !beginAudioTransition()) return;
    try {
      const deviceId = selectedAudioDevices.output.id !== "default"
        ? selectedAudioDevices.output.id
        : null;
      setCaptureDeviceName(selectedAudioDevices.output.name || "System default output");
      await invoke<string>("start_system_audio_capture", {
        vadConfig: { ...vadConfig, enabled: true },
        deviceId,
      });
      pausedRef.current = false;
      setIsPaused(false);
      setError("");
    } catch (err) {
      setError(`Failed to resume Listen: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      endAudioTransition();
    }
  }, [capturing, isPaused, selectedAudioDevices.output.id, selectedAudioDevices.output.name, vadConfig, beginAudioTransition, endAudioTransition]);

  // Manual stop for continuous recording
  const manualStopAndSend = useCallback(async () => {
    if (!isContinuousMode || !recordingRef.current || !beginAudioTransition()) return;
    try {
      // Show processing state immediately
      setIsProcessing(true);

      // Trigger manual stop event
      await invoke("manual_stop_continuous");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to manually stop: ${errorMessage}`);
      setIsProcessing(false); // Clear processing state on error
      console.error("Manual stop error:", err);
    } finally {
      endAudioTransition();
    }
  }, [isContinuousMode, beginAudioTransition, endAudioTransition]);

  const handleSetup = useCallback(async () => {
    try {
      const platform = navigator.platform.toLowerCase();

      if (platform.includes("mac") || platform.includes("win")) {
        await invoke("request_system_audio_access");
      }

      // Delay to give the user time to grant permissions in the system dialog.
      await new Promise((resolve) => setTimeout(resolve, 3000));

      const hasAccess = await invoke<boolean>("check_system_audio_access");
      if (hasAccess) {
        setSetupRequired(false);
        await startCapture();
      } else {
        setSetupRequired(true);
        setError("Permission not granted. Please try the manual steps.");
      }
    } catch (err) {
      setError("Failed to request access. Please try the manual steps below.");
      setSetupRequired(true);
    }
  }, [startCapture]);

  useEffect(() => {
    const shouldOpenPopover =
      capturing ||
      setupRequired ||
      isProcessing ||
      isAIProcessing ||
      transcriptTurns.length > 0 ||
      !!lastAIResponse ||
      !!error;
    setIsPopoverOpen(shouldOpenPopover);
    resizeWindow(shouldOpenPopover, "listen");
  }, [
    capturing,
    setupRequired,
    isProcessing,
    isAIProcessing,
    transcriptTurns.length,
    lastAIResponse,
    error,
    resizeWindow,
  ]);

  useEffect(() => {
    globalShortcuts.registerSystemAudioCallback(async () => {
      if (capturing) {
        await stopCapture();
      } else {
        await startCapture();
      }
    });
  }, [capturing, startCapture, stopCapture]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      queuedGenerationRef.current = null;
      sessionActiveRef.current = false;
      sessionGenerationRef.current += 1;
      invoke("stop_system_audio_capture").catch(() => {});
    };
  }, []);

  // Debounced save to prevent race conditions and improve performance
  useEffect(() => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Only debounce if there are messages to save
    if (
      !conversation.id ||
      conversation.updatedAt === 0 ||
      conversation.messages.length === 0
    ) {
      return;
    }

    // Debounce saves (only save 500ms after last change)
    saveTimeoutRef.current = setTimeout(async () => {
      // Don't save if already saving (prevent concurrent saves)
      if (isSavingRef.current) {
        return;
      }

      try {
        isSavingRef.current = true;
        await saveConversation(conversation);
      } catch (error) {
        console.error("Failed to save system audio conversation:", error);
      } finally {
        isSavingRef.current = false;
      }
    }, CONVERSATION_SAVE_DEBOUNCE_MS);

    // Cleanup on unmount or dependency change
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    conversation.messages.length,
    conversation.title,
    conversation.id,
    conversation.updatedAt,
  ]);

  const startNewConversation = useCallback(() => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    queuedGenerationRef.current = null;
    generationActiveRef.current = false;
    setResponseQueued(false);
    setConversation({
      id: generateConversationId("sysaudio"),
      title: "",
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    setLastTranscription("");
    setLastAIResponse("");
    transcriptTurnsRef.current = [];
    sessionGenerationRef.current += 1;
    turnSequenceRef.current = 0;
    setTranscriptTurns([]);
    setError("");
    setSetupRequired(false);
    setIsProcessing(false);
    setIsAIProcessing(false);
    setIsPopoverOpen(capturing);
    if (capturing) setSessionStartedAt(Date.now());
    setUseSystemPrompt(true);
  }, [capturing]);

  // Update VAD configuration
  const updateVadConfiguration = useCallback(async (config: VadConfig) => {
    if (!beginAudioTransition()) return;
    try {
      // The native task holds a config snapshot. Restart automatic capture for
      // every setting change so sensitivity and silence controls take effect.
      const modeChanged = config.enabled !== vadConfig.enabled;
      const restartCapture = capturing && !isPaused && (modeChanged || vadConfig.enabled);
      if (restartCapture) {
        await invoke("stop_system_audio_capture");
        recordingRef.current = false;
        setIsRecordingInContinuousMode(false);
        setRecordingProgress(0);
      }
      await invoke("update_vad_config", { config });
      setVadConfig(config);
      setIsContinuousMode(capturing && !config.enabled);
      safeLocalStorage.setItem("vad_config", JSON.stringify(config));
      if (restartCapture && config.enabled) {
        setCaptureDeviceName(selectedAudioDevices.output.name || "System default output");
        await invoke("start_system_audio_capture", {
          vadConfig: config,
          deviceId: selectedAudioDevices.output.id === "default" ? null : selectedAudioDevices.output.id,
        });
      }
      setError("");
    } catch (err) {
      setError(`Failed to change recording settings: ${err}`);
    } finally {
      endAudioTransition();
    }
  }, [capturing, isPaused, vadConfig.enabled, selectedAudioDevices.output.id, selectedAudioDevices.output.name, beginAudioTransition, endAudioTransition]);

  // Keyboard arrow key support for scrolling (local shortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPopoverOpen) return;

      const scrollElement = scrollAreaRef.current?.querySelector(
        "[data-radix-scroll-area-viewport]"
      ) as HTMLElement;

      if (!scrollElement) return;

      const scrollAmount = 100; // pixels to scroll

      if (e.key === "ArrowDown") {
        e.preventDefault();
        scrollElement.scrollBy({ top: scrollAmount, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        scrollElement.scrollBy({ top: -scrollAmount, behavior: "smooth" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPopoverOpen]);

  // Keyboard shortcuts for continuous mode recording (local shortcuts)
  useEffect(() => {
    const handleRecordingShortcuts = (e: KeyboardEvent) => {
      if (!isPopoverOpen || !isContinuousMode) return;
      if (isProcessing || isAIProcessing || audioTransitionRef.current || e.repeat) return;
      const target = e.target as HTMLElement;
      if (target.closest?.("input, textarea, button, [contenteditable=true], [role=combobox]")) return;

      // Enter: Start recording (when not recording) or Stop & Send (when recording)
      if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        if (!isRecordingInContinuousMode) {
          startContinuousRecording();
        } else {
          manualStopAndSend();
        }
      }

      // Escape: Ignore recording (when recording)
      if (e.key === "Escape" && isRecordingInContinuousMode) {
        e.preventDefault();
        ignoreContinuousRecording();
      }

      // Space: Start recording (when not recording) - only if not typing in input
      if (
        e.key === " " &&
        !isRecordingInContinuousMode &&
        !e.metaKey &&
        !e.ctrlKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement)
      ) {
        e.preventDefault();
        startContinuousRecording();
      }
    };

    window.addEventListener("keydown", handleRecordingShortcuts);
    return () =>
      window.removeEventListener("keydown", handleRecordingShortcuts);
  }, [
    isPopoverOpen,
    isContinuousMode,
    isRecordingInContinuousMode,
    isAudioTransitioning,
    isProcessing,
    isAIProcessing,
    startContinuousRecording,
    manualStopAndSend,
    ignoreContinuousRecording,
  ]);

  return {
    capturing,
    captureActive,
    audioLevel,
    captureDeviceName,
    isPaused,
    pauseCapture,
    resumeCapture,
    microphoneActive,
    microphoneSpeaking,
    microphoneLoading,
    microphoneLevel,
    microphoneDeviceName: selectedAudioDevices.input?.name || "System default microphone",
    microphoneDeviceId: selectedAudioDevices.input?.id,
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
    isAudioTransitioning,
    isProcessing,
    isAIProcessing,
    lastTranscription,
    lastAIResponse,
    error,
    setupRequired,
    startCapture,
    stopCapture,
    handleSetup,
    isPopoverOpen,
    setIsPopoverOpen,
    // Conversation management
    conversation,
    setConversation,
    // AI processing
    processWithAI,
    // Context management
    useSystemPrompt,
    setUseSystemPrompt: updateUseSystemPrompt,
    contextContent,
    setContextContent: updateContextContent,
    startNewConversation,
    // Window resize
    resizeWindow,
    quickActions,
    addQuickAction,
    removeQuickAction,
    isManagingQuickActions,
    setIsManagingQuickActions,
    showQuickActions,
    setShowQuickActions,
    handleQuickActionClick,
    // VAD configuration
    vadConfig,
    updateVadConfiguration,
    // Continuous recording
    isContinuousMode,
    isRecordingInContinuousMode,
    recordingProgress,
    manualStopAndSend,
    startContinuousRecording,
    ignoreContinuousRecording,
    // Scroll area ref for keyboard navigation
    scrollAreaRef,
  };
}

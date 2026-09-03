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
  const audioTransitionRef = useRef(false);
  const recordingRef = useRef(false);

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
      void invoke("diagnostics_record_pipeline", { update: {
        panel_open: isPopoverOpen, capture_enabled: capturing, capture_active: captureActive,
        recording: isRecordingInContinuousMode, transcribing: isProcessing, generating: isAIProcessing,
        stt_configured: Boolean(selectedSttProvider.provider), ai_configured: Boolean(selectedAIProvider.provider),
        transcript_chars: lastTranscription.length, response_chars: lastAIResponse.length, has_error: Boolean(error),
      } }).catch(() => {});
    };
    const timer = setTimeout(report, 200);
    const heartbeat = setInterval(report, 2000);
    return () => { clearTimeout(timer); clearInterval(heartbeat); };
  }, [isPopoverOpen, capturing, captureActive, isRecordingInContinuousMode, isProcessing, isAIProcessing,
    selectedSttProvider.provider, selectedAIProvider.provider, lastTranscription.length, lastAIResponse.length, error]);

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
          setIsProcessing(false);
          setIsAIProcessing(false);
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

  // Handle single speech detection event (both VAD and continuous modes)
  useEffect(() => {
    let speechUnlisten: (() => void) | undefined;
    let disposed = false;

    const setupEventListener = async () => {
      try {
        speechUnlisten = await listen("speech-detected", async (event) => {
          try {
            if (disposed || !capturing) return;

            const base64Audio = event.payload as string;
            // Convert to blob
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            const audioBlob = new Blob([bytes], { type: "audio/wav" });

            const providerConfig = allSttProviders.find(
              (p) => p.id === selectedSttProvider.provider
            );

            setIsProcessing(true);

            try {
              const transcription = await fetchSTT({
                provider: providerConfig,
                selectedProvider: selectedSttProvider,
                audio: audioBlob,
                source: "system",
              });

              if (transcription.trim()) {
                setLastTranscription(transcription);
                setIsProcessing(false);
                setError("");

                const effectiveSystemPrompt = useSystemPrompt
                  ? systemPrompt || DEFAULT_SYSTEM_PROMPT
                  : contextContent || DEFAULT_SYSTEM_PROMPT;

                const previousMessages = conversation.messages.map((msg) => {
                  return { role: msg.role, content: msg.content };
                });

                await processWithAI(
                  transcription,
                  effectiveSystemPrompt,
                  previousMessages
                );
              } else {
                setError("No speech was recognized. Check the System Audio level and the meeting's speaker device, or try Manual mode.");
                setIsPopoverOpen(true);
              }
            } catch (sttError: any) {
              console.error("STT Error:", sttError);
              setError(sttError.message || "Failed to transcribe audio");
              setIsPopoverOpen(true);
            }
          } catch (err) {
            setError("Failed to process speech");
          } finally {
            setIsProcessing(false);
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
  }, [
    capturing,
    selectedSttProvider,
    allSttProviders,
    selectedAIProvider,
    allAiProviders,
    useSystemPrompt,
    systemPrompt,
    contextContent,
    conversation.messages.length,
  ]);

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
      previousMessages: Message[]
    ) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

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
          source: "system",
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
        if (abortControllerRef.current === requestController) setIsAIProcessing(false);
        // No auto-restart - user manually controls when to start next recording
      }
    },
    [selectedAIProvider, allAiProviders, conversation.messages]
  );

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

      const isContinuous = !vadConfig.enabled;
      // Release any previous session before entering either mode.
      await invoke("stop_system_audio_capture");
      recordingRef.current = false;

      // Set up conversation
      const conversationId = generateConversationId("sysaudio");
      setConversation({
        id: conversationId,
        title: "",
        messages: [],
        createdAt: 0,
        updatedAt: 0,
      });

      setCapturing(true);
      setIsPopoverOpen(true);
      setIsContinuousMode(isContinuous);
      setRecordingProgress(0);

      // If continuous mode
      if (isContinuous) {
        setIsRecordingInContinuousMode(false);
        return;
      }

      // VAD mode: Start recording immediately
      const deviceId =
        selectedAudioDevices.output.id !== "default"
          ? selectedAudioDevices.output.id
          : null;

      // Start capture with VAD config
      setCaptureDeviceName(selectedAudioDevices.output.name || "System default output");
      await invoke<string>("start_system_audio_capture", {
        vadConfig: vadConfig,
        deviceId: deviceId,
      });
    } catch (err) {
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
      // Abort any ongoing AI requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Stop the audio capture
      await invoke<string>("stop_system_audio_capture");

      // Reset ALL states
      setCapturing(false);
      recordingRef.current = false;
      setIsProcessing(false);
      setIsAIProcessing(false);
      setIsContinuousMode(false);
      setIsRecordingInContinuousMode(false);
      setRecordingProgress(0);
      setLastTranscription("");
      setLastAIResponse("");
      setError("");
      setIsPopoverOpen(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Failed to stop capture: ${errorMessage}`);
      console.error("Stop capture error:", err);
    } finally {
      endAudioTransition();
    }
  }, [beginAudioTransition, endAudioTransition]);

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
      isAIProcessing ||
      !!lastAIResponse ||
      !!error;
    setIsPopoverOpen(shouldOpenPopover);
    resizeWindow(shouldOpenPopover);
  }, [
    capturing,
    setupRequired,
    isAIProcessing,
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
    setConversation({
      id: generateConversationId("sysaudio"),
      title: "",
      messages: [],
      createdAt: 0,
      updatedAt: 0,
    });
    setLastTranscription("");
    setLastAIResponse("");
    setError("");
    setSetupRequired(false);
    setIsProcessing(false);
    setIsAIProcessing(false);
    setIsPopoverOpen(false);
    setUseSystemPrompt(true);
  }, []);

  // Update VAD configuration
  const updateVadConfiguration = useCallback(async (config: VadConfig) => {
    if (!beginAudioTransition()) return;
    try {
      // The native task holds a config snapshot. Restart automatic capture for
      // every setting change so sensitivity and silence controls take effect.
      const modeChanged = config.enabled !== vadConfig.enabled;
      const restartCapture = capturing && (modeChanged || vadConfig.enabled);
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
  }, [capturing, vadConfig.enabled, selectedAudioDevices.output.id, selectedAudioDevices.output.name, beginAudioTransition, endAudioTransition]);

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

import { useEffect, useRef, useState } from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import { floatArrayToWav } from "@/lib/utils";
import {
  openPreferredMicrophone,
  type MicrophoneCaptureStatus,
  type MicrophoneStreamInfo,
} from "@/lib/microphone";
import type { SystemAudioLevel } from "@/hooks/useSystemAudio";

interface ListenMicrophoneProps {
  paused: boolean;
  deviceId?: string;
  deviceName?: string;
  onAudio: (audio: Blob, capturedAt: number) => void;
  onLevel: (level: SystemAudioLevel | null) => void;
  onStatus: (status: MicrophoneCaptureStatus) => void;
}

export const ListenMicrophone = ({
  paused,
  deviceId,
  deviceName,
  onAudio,
  onLevel,
  onStatus,
}: ListenMicrophoneProps) => {
  const callbacks = useRef({ onAudio, onLevel, onStatus });
  const lastLevelAt = useRef(0);
  const samplesReceived = useRef(0);
  const lastFrameAt = useRef(0);
  const listeningSince = useRef(0);
  const [hasFrames, setHasFrames] = useState(false);
  const [watchdogError, setWatchdogError] = useState("");
  const [streamInfo, setStreamInfo] = useState<MicrophoneStreamInfo | null>(null);
  callbacks.current = { onAudio, onLevel, onStatus };

  const openStream = async () => {
    const opened = await openPreferredMicrophone({ id: deviceId, name: deviceName });
    setStreamInfo(opened.info);
    return opened.stream;
  };

  const vad = useMicVAD({
    baseAssetPath: "/vad/",
    onnxWASMBasePath: "/vad/",
    startOnLoad: true,
    processorType: "ScriptProcessor",
    userSpeakingThreshold: 0.6,
    submitUserSpeechOnPause: false,
    getStream: openStream,
    resumeStream: openStream,
    onFrameProcessed: (_probabilities, frame) => {
      const now = Date.now();
      samplesReceived.current += frame.length;
      lastFrameAt.current = now;
      if (!hasFrames) setHasFrames(true);
      if (watchdogError) setWatchdogError("");
      if (now - lastLevelAt.current < 90) return;
      lastLevelAt.current = now;
      let sum = 0;
      let peak = 0;
      for (const sample of frame) {
        const absolute = Math.abs(sample);
        sum += sample * sample;
        peak = Math.max(peak, absolute);
      }
      callbacks.current.onLevel({
        rms: Math.sqrt(sum / Math.max(frame.length, 1)),
        peak,
        samples: frame.length,
      });
    },
    onSpeechEnd: (audio) => {
      callbacks.current.onAudio(floatArrayToWav(audio, 16_000, "wav"), Date.now());
    },
  });

  useEffect(() => {
    if (paused && vad.listening) {
      void vad.pause();
      callbacks.current.onLevel(null);
      setHasFrames(false);
      lastFrameAt.current = 0;
    } else if (!paused && !vad.listening && !vad.loading && !vad.errored) {
      void vad.start();
    }
  }, [paused, vad.listening, vad.loading, vad.errored, vad.pause, vad.start]);

  useEffect(() => {
    if (!vad.listening || paused) {
      listeningSince.current = 0;
      return;
    }
    listeningSince.current = Date.now();
    setHasFrames(false);
    setWatchdogError("");
    const timer = setInterval(() => {
      const lastSignalAt = lastFrameAt.current || listeningSince.current;
      if (Date.now() - lastSignalAt > 4_000) {
        setWatchdogError("No microphone audio frames received. Reconnect it or choose another microphone.");
      }
    }, 1_000);
    return () => clearInterval(timer);
  }, [paused, vad.listening]);

  useEffect(() => {
    const report = () => {
      const error = vad.errored || watchdogError;
      const recentFrame = lastFrameAt.current > 0 && Date.now() - lastFrameAt.current < 4_000;
      callbacks.current.onStatus({
        active: vad.listening && !paused && hasFrames && recentFrame && !error,
        speaking: vad.userSpeaking && !paused,
        loading: vad.loading || (vad.listening && !paused && !hasFrames && !error),
        error,
        samplesReceived: samplesReceived.current,
        lastFrameAt: lastFrameAt.current,
        streamInfo,
      });
    };
    report();
    const heartbeat = setInterval(report, 1_000);
    return () => clearInterval(heartbeat);
  }, [paused, hasFrames, watchdogError, streamInfo, vad.listening, vad.userSpeaking, vad.loading, vad.errored]);

  useEffect(() => () => {
    callbacks.current.onLevel(null);
    callbacks.current.onStatus({
      active: false,
      speaking: false,
      loading: false,
      error: "",
      samplesReceived: samplesReceived.current,
      lastFrameAt: lastFrameAt.current,
      streamInfo: null,
    });
  }, []);

  return null;
};

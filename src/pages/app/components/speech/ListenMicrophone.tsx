import { useEffect, useRef } from "react";
import { useMicVAD } from "@ricky0123/vad-react";
import { floatArrayToWav } from "@/lib/utils";
import type { SystemAudioLevel } from "@/hooks/useSystemAudio";

interface ListenMicrophoneProps {
  paused: boolean;
  deviceId?: string;
  onAudio: (audio: Blob, capturedAt: number) => void;
  onLevel: (level: SystemAudioLevel | null) => void;
  onStatus: (status: {
    active: boolean;
    speaking: boolean;
    loading: boolean;
    error: string;
  }) => void;
}

export const ListenMicrophone = ({
  paused,
  deviceId,
  onAudio,
  onLevel,
  onStatus,
}: ListenMicrophoneProps) => {
  const callbacks = useRef({ onAudio, onLevel, onStatus });
  const lastLevelAt = useRef(0);
  callbacks.current = { onAudio, onLevel, onStatus };

  const constraints: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    ...(deviceId && deviceId !== "default"
      ? { deviceId: { exact: deviceId } }
      : {}),
  };

  const vad = useMicVAD({
    baseAssetPath: "/vad/",
    onnxWASMBasePath: "/vad/",
    startOnLoad: true,
    userSpeakingThreshold: 0.6,
    submitUserSpeechOnPause: false,
    getStream: () => navigator.mediaDevices.getUserMedia({ audio: constraints }),
    resumeStream: () => navigator.mediaDevices.getUserMedia({ audio: constraints }),
    onFrameProcessed: (_probabilities, frame) => {
      const now = Date.now();
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
    } else if (!paused && !vad.listening && !vad.loading && !vad.errored) {
      void vad.start();
    }
  }, [paused, vad.listening, vad.loading, vad.errored, vad.pause, vad.start]);

  useEffect(() => {
    callbacks.current.onStatus({
      active: vad.listening && !paused,
      speaking: vad.userSpeaking,
      loading: vad.loading,
      error: vad.errored || "",
    });
  }, [paused, vad.listening, vad.userSpeaking, vad.loading, vad.errored]);

  useEffect(() => () => callbacks.current.onLevel(null), []);

  return null;
};

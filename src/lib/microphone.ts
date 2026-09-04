export type MicrophoneSelectionMode =
  | "browser_id"
  | "label"
  | "default"
  | "fallback";

export interface MicrophoneStreamInfo {
  selectionMode: MicrophoneSelectionMode;
  resolvedName: string;
  streamActive: boolean;
  trackLive: boolean;
  trackMuted: boolean;
  trackEnabled: boolean;
  sampleRate: number;
  channelCount: number;
}

export interface MicrophoneCaptureStatus {
  active: boolean;
  speaking: boolean;
  loading: boolean;
  error: string;
  samplesReceived: number;
  lastFrameAt: number;
  streamInfo: MicrophoneStreamInfo | null;
}

interface PreferredMicrophone {
  id?: string;
  name?: string;
}

interface OpenedMicrophone {
  stream: MediaStream;
  info: MicrophoneStreamInfo;
}

const baseAudioConstraints = (): MediaTrackConstraints => ({
  channelCount: { ideal: 1 },
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
});

const normalizedLabel = (label: string) =>
  label
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const hardwareHints = (label: string) =>
  [...label.matchAll(/\(([^()]+)\)/g)]
    .map((match) => normalizedLabel(match[1]))
    .filter((hint) => hint.length >= 5);

export const findPreferredAudioInput = (
  devices: Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">[],
  preferred: PreferredMicrophone
) => {
  const inputs = devices.filter((device) => device.kind === "audioinput");
  const preferredId = preferred.id?.trim();
  if (preferredId && preferredId !== "default") {
    const byBrowserId = inputs.find((device) => device.deviceId === preferredId);
    if (byBrowserId) return { device: byBrowserId, mode: "browser_id" as const };
  }

  const target = normalizedLabel(preferred.name || "");
  if (!target) return null;

  const exact = inputs.find((device) => normalizedLabel(device.label) === target);
  if (exact) return { device: exact, mode: "label" as const };

  const targetHints = hardwareHints(preferred.name || "");
  const hinted = inputs.filter((device) => {
    const hints = hardwareHints(device.label);
    return targetHints.some((targetHint) => hints.includes(targetHint));
  });
  if (hinted.length === 1) return { device: hinted[0], mode: "label" as const };

  const contained = inputs.filter((device) => {
    const candidate = normalizedLabel(device.label);
    return candidate.length >= 8 && (candidate.includes(target) || target.includes(candidate));
  });
  return contained.length === 1
    ? { device: contained[0], mode: "label" as const }
    : null;
};

export const microphoneStreamInfo = (
  stream: MediaStream,
  selectionMode: MicrophoneSelectionMode
): MicrophoneStreamInfo => {
  const track = stream.getAudioTracks()[0];
  const settings = track?.getSettings?.() || {};
  return {
    selectionMode,
    resolvedName: track?.label || "System default microphone",
    streamActive: stream.active,
    trackLive: track?.readyState === "live",
    trackMuted: Boolean(track?.muted),
    trackEnabled: Boolean(track?.enabled),
    sampleRate: Number(settings.sampleRate || 0),
    channelCount: Number(settings.channelCount || 0),
  };
};

const stopStream = (stream: MediaStream) => {
  stream.getTracks().forEach((track) => track.stop());
};

export const openPreferredMicrophone = async (
  preferred: PreferredMicrophone,
  mediaDevices: MediaDevices = navigator.mediaDevices
): Promise<OpenedMicrophone> => {
  if (!mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is unavailable in this WebView.");
  }

  const enumerate = async () => {
    try {
      return await mediaDevices.enumerateDevices();
    } catch {
      return [] as MediaDeviceInfo[];
    }
  };

  const open = (browserDeviceId?: string) =>
    mediaDevices.getUserMedia({
      audio: {
        ...baseAudioConstraints(),
        ...(browserDeviceId
          ? { deviceId: { exact: browserDeviceId } }
          : {}),
      },
    });

  const initialMatch = findPreferredAudioInput(await enumerate(), preferred);
  if (initialMatch) {
    try {
      const stream = await open(initialMatch.device.deviceId);
      return {
        stream,
        info: microphoneStreamInfo(stream, initialMatch.mode),
      };
    } catch {
      // Permission may be needed before WebView2 exposes usable device IDs.
    }
  }

  const defaultStream = await open();
  const afterPermissionMatch = findPreferredAudioInput(await enumerate(), preferred);
  if (afterPermissionMatch) {
    const defaultDeviceId = defaultStream.getAudioTracks()[0]?.getSettings?.().deviceId;
    if (defaultDeviceId === afterPermissionMatch.device.deviceId) {
      return {
        stream: defaultStream,
        info: microphoneStreamInfo(defaultStream, afterPermissionMatch.mode),
      };
    }
    try {
      const preferredStream = await open(afterPermissionMatch.device.deviceId);
      stopStream(defaultStream);
      return {
        stream: preferredStream,
        info: microphoneStreamInfo(preferredStream, afterPermissionMatch.mode),
      };
    } catch {
      // Keep the valid default stream and expose that fallback in diagnostics.
    }
  }

  const requestedSpecificDevice = Boolean(
    (preferred.id && preferred.id !== "default") || preferred.name
  );
  return {
    stream: defaultStream,
    info: microphoneStreamInfo(
      defaultStream,
      requestedSpecificDevice ? "fallback" : "default"
    ),
  };
};

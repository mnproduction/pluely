import { Button } from "@/components";
import { openPreferredMicrophone } from "@/lib/microphone";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { HeadphonesIcon, MicIcon, SquareIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Level {
  rms: number;
  peak: number;
  samples: number;
}

interface AudioTestProps {
  inputDevice: { id: string; name: string };
  outputDevice: { id: string; name: string };
}

const Meter = ({ label, level, active }: { label: string; level: Level | null; active: boolean }) => {
  const peak = active ? Math.max(0, Math.min(1, level?.peak ?? 0)) : 0;
  const db = peak > 0 ? Math.max(-60, 20 * Math.log10(peak)) : -60;
  const width = Math.min(100, Math.max(0, ((db + 60) / 60) * 100));
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={-60}
      aria-valuemax={0}
      aria-valuenow={Math.min(0, Math.round(db))}
      className="h-2 overflow-hidden rounded-full bg-muted"
    >
      <div
        className="h-full bg-emerald-500 transition-[width] duration-100"
        style={{ width: `${width}%` }}
      />
    </div>
  );
};

export const AudioTest = ({ inputDevice, outputDevice }: AudioTestProps) => {
  const [microphoneTesting, setMicrophoneTesting] = useState(false);
  const [microphoneLevel, setMicrophoneLevel] = useState<Level | null>(null);
  const [microphoneStatus, setMicrophoneStatus] = useState("Ready to test");
  const [systemTesting, setSystemTesting] = useState(false);
  const [systemLevel, setSystemLevel] = useState<Level | null>(null);
  const [systemStatus, setSystemStatus] = useState("Ready to test");
  const microphoneStream = useRef<MediaStream | null>(null);
  const microphoneContext = useRef<AudioContext | null>(null);
  const animationFrame = useRef<number | null>(null);
  const startedSystemTest = useRef(false);

  const stopMicrophoneTest = useCallback(() => {
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
    animationFrame.current = null;
    microphoneStream.current?.getTracks().forEach((track) => track.stop());
    microphoneStream.current = null;
    void microphoneContext.current?.close().catch(() => undefined);
    microphoneContext.current = null;
    setMicrophoneTesting(false);
    setMicrophoneLevel(null);
    setMicrophoneStatus("Ready to test");
  }, []);

  const startMicrophoneTest = async () => {
    setMicrophoneStatus("Connecting to microphone...");
    try {
      const opened = await openPreferredMicrophone(inputDevice);
      const context = new AudioContext();
      const source = context.createMediaStreamSource(opened.stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      microphoneStream.current = opened.stream;
      microphoneContext.current = context;
      setMicrophoneTesting(true);
      setMicrophoneStatus(`Listening to ${opened.info.resolvedName}`);

      const measure = () => {
        analyser.getFloatTimeDomainData(samples);
        let sumSquares = 0;
        let peak = 0;
        for (const sample of samples) {
          sumSquares += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
        }
        setMicrophoneLevel({
          rms: Math.sqrt(sumSquares / samples.length),
          peak,
          samples: samples.length,
        });
        animationFrame.current = requestAnimationFrame(measure);
      };
      measure();
    } catch (error) {
      stopMicrophoneTest();
      setMicrophoneStatus(
        error instanceof Error ? error.message : "Could not test this microphone."
      );
    }
  };

  const startSystemTest = async () => {
    setSystemStatus("Connecting to system audio...");
    setSystemLevel(null);
    try {
      await invoke("start_system_audio_test", {
        deviceId: outputDevice.id || null,
      });
      startedSystemTest.current = true;
      setSystemTesting(true);
      setSystemStatus("Play speech through this output device");
    } catch (error) {
      setSystemStatus(
        error instanceof Error ? error.message : String(error || "Could not test system audio.")
      );
    }
  };

  const stopSystemTest = useCallback(async () => {
    if (startedSystemTest.current) {
      try {
        await invoke("stop_system_audio_test");
      } catch (error) {
        setSystemStatus(
          error instanceof Error ? error.message : String(error || "Could not stop the test.")
        );
        return;
      }
    }
    startedSystemTest.current = false;
    setSystemTesting(false);
    setSystemLevel(null);
    setSystemStatus("Ready to test");
  }, []);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let disposed = false;
    const register = async () => {
      const levelUnlisten = await listen<Level>("system-audio-test-level", (event) => {
        if (!disposed && startedSystemTest.current) {
          setSystemLevel(event.payload);
          setSystemStatus(
            event.payload.peak > 0.0001 ? "Sound received" : "No sound detected yet"
          );
        }
      });
      const errorUnlisten = await listen<string>("system-audio-test-error", (event) => {
        if (!disposed && startedSystemTest.current) setSystemStatus(event.payload);
      });
      const stoppedUnlisten = await listen("system-audio-test-stopped", () => {
        if (!disposed && startedSystemTest.current) {
          startedSystemTest.current = false;
          setSystemTesting(false);
          setSystemLevel(null);
          setSystemStatus("Test stopped");
        }
      });
      if (disposed) {
        levelUnlisten();
        errorUnlisten();
        stoppedUnlisten();
      } else {
        unlisteners.push(levelUnlisten, errorUnlisten, stoppedUnlisten);
      }
    };
    void register();
    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);

  useEffect(
    () => () => {
      stopMicrophoneTest();
      if (startedSystemTest.current) void invoke("stop_system_audio_test");
    },
    [stopMicrophoneTest]
  );

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <section className="space-y-3 rounded-xl border bg-muted/30 p-4" aria-labelledby="microphone-test-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="microphone-test-title" className="flex items-center gap-2 text-sm font-medium">
              <MicIcon className="size-4 text-sky-600" />
              You: microphone
            </h3>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{inputDevice.name || "No microphone selected"}</p>
          </div>
          <Button
            size="sm"
            variant={microphoneTesting ? "destructive" : "outline"}
            onClick={microphoneTesting ? stopMicrophoneTest : startMicrophoneTest}
            disabled={!inputDevice.id || systemTesting}
          >
            {microphoneTesting && <SquareIcon className="size-3" />}
            {microphoneTesting ? "Stop" : "Test"}
          </Button>
        </div>
        <Meter label="Microphone test level" level={microphoneLevel} active={microphoneTesting} />
        <p className="min-h-8 text-xs text-muted-foreground" aria-live="polite">{microphoneStatus}</p>
      </section>

      <section className="space-y-3 rounded-xl border bg-muted/30 p-4" aria-labelledby="system-test-title">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 id="system-test-title" className="flex items-center gap-2 text-sm font-medium">
              <HeadphonesIcon className="size-4 text-violet-600" />
              Them: system audio
            </h3>
            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{outputDevice.name || "No output selected"}</p>
          </div>
          <Button
            size="sm"
            variant={systemTesting ? "destructive" : "outline"}
            onClick={systemTesting ? stopSystemTest : startSystemTest}
            disabled={!outputDevice.id || microphoneTesting}
          >
            {systemTesting && <SquareIcon className="size-3" />}
            {systemTesting ? "Stop" : "Test"}
          </Button>
        </div>
        <Meter label="System audio test level" level={systemLevel} active={systemTesting} />
        <p className="min-h-8 text-xs text-muted-foreground" aria-live="polite">{systemStatus}</p>
      </section>

      <p className="text-xs text-muted-foreground sm:col-span-2">
        Tests show signal level only. Audio is not transcribed or saved.
      </p>
    </div>
  );
};

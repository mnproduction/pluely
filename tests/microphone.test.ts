import { describe, expect, it } from "vitest";
import {
  findPreferredAudioInput,
  openPreferredMicrophone,
} from "../src/lib/microphone";

const input = (deviceId: string, label: string) => ({
  kind: "audioinput" as MediaDeviceKind,
  deviceId,
  label,
});

describe("microphone device resolution", () => {
  it("uses a browser device ID only when enumerateDevices exposes that ID", () => {
    const devices = [input("webview-id", "JBL Quantum One Chat")];
    expect(findPreferredAudioInput(devices, { id: "webview-id", name: "Other" }))
      .toEqual({ device: devices[0], mode: "browser_id" });
    expect(findPreferredAudioInput(devices, {
      id: "{0.0.1.00000000}.{WASAPI-ID}",
      name: "Other",
    })).toBeNull();
  });

  it("maps a Windows endpoint to a WebView2 input by its friendly label", () => {
    const devices = [
      input("hashed-webview-id", "Микрофон гарнитуры (JBL Quantum One Chat)"),
    ];
    expect(findPreferredAudioInput(devices, {
      id: "{0.0.1.00000000}.{7461EBB9-7935-4716-8DB6-A4771057D568}",
      name: "Микрофон гарнитуры (JBL Quantum One Chat)",
    })).toEqual({ device: devices[0], mode: "label" });
  });

  it("matches localized labels by their unique hardware name", () => {
    const devices = [
      input("jbl", "Microphone (JBL Quantum One Chat)"),
      input("usb", "Microphone (USB PnP Audio Device)"),
    ];
    expect(findPreferredAudioInput(devices, {
      name: "Микрофон гарнитуры (JBL Quantum One Chat)",
    })).toEqual({ device: devices[0], mode: "label" });
  });

  it("does not guess when a hardware hint is ambiguous", () => {
    const devices = [
      input("one", "Microphone 1 (Shared Device)"),
      input("two", "Microphone 2 (Shared Device)"),
    ];
    expect(findPreferredAudioInput(devices, { name: "Mic (Shared Device)" }))
      .toBeNull();
  });

  it("opens the matched WebView2 device after permission reveals labels", async () => {
    const stopped = { value: false };
    const stream = (deviceId: string, label: string, stop = () => {}) => ({
      active: true,
      getTracks: () => [{ stop }],
      getAudioTracks: () => [{
        label,
        readyState: "live",
        muted: false,
        enabled: true,
        getSettings: () => ({ deviceId, sampleRate: 48_000, channelCount: 1 }),
      }],
    } as unknown as MediaStream);
    const fallback = stream("default-id", "Default microphone", () => {
      stopped.value = true;
    });
    const selected = stream("webview-jbl", "Microphone (JBL Quantum One Chat)");
    let permissionGranted = false;
    const calls: MediaStreamConstraints[] = [];
    const mediaDevices = {
      enumerateDevices: async () => permissionGranted
        ? [input("webview-jbl", "Microphone (JBL Quantum One Chat)")]
        : [input("webview-jbl", "")],
      getUserMedia: async (constraints: MediaStreamConstraints) => {
        calls.push(constraints);
        const exact = (constraints.audio as MediaTrackConstraints)?.deviceId;
        if (exact) return selected;
        permissionGranted = true;
        return fallback;
      },
    } as unknown as MediaDevices;

    const opened = await openPreferredMicrophone({
      id: "{0.0.1.00000000}.{WASAPI-ID}",
      name: "Микрофон гарнитуры (JBL Quantum One Chat)",
    }, mediaDevices);

    expect(calls).toHaveLength(2);
    expect(calls[0].audio).not.toHaveProperty("deviceId");
    expect(calls[1].audio).toMatchObject({ deviceId: { exact: "webview-jbl" } });
    expect(stopped.value).toBe(true);
    expect(opened.stream).toBe(selected);
    expect(opened.info).toMatchObject({
      selectionMode: "label",
      trackLive: true,
      sampleRate: 48_000,
      channelCount: 1,
    });
  });
});

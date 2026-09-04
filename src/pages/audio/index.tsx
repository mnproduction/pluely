import { AudioSelection } from "./components";
import { PageLayout } from "@/layouts";
import { getPlatform } from "@/lib";

const getOsInstructions = () => {
  const platform = getPlatform();

  switch (platform) {
    case "macos":
      return {
        mic: "System Preferences → Sound → Input",
        audio: "System Preferences → Sound → Output",
      };
    case "windows":
      return {
        mic: "Settings → System → Sound → Input",
        audio: "Settings → System → Sound → Output",
      };
    case "linux":
      return {
        mic: "Sound Settings → Input Devices",
        audio: "Sound Settings → Output Devices",
      };
    default:
      return {
        mic: "your system's sound settings",
        audio: "your system's sound settings",
      };
  }
};

const Audio = () => {
  const osInstructions = getOsInstructions();

  return (
    <PageLayout
      title="Audio Settings"
      description="Choose and verify both sides of a Listen session"
    >
      <AudioSelection />

      <div className="space-y-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        <p>
          <strong>If a test receives no signal:</strong> open{" "}
          <strong>{osInstructions.mic}</strong> for microphone and{" "}
          <strong>{osInstructions.audio}</strong> for speakers/headphones.
          In meeting apps, the Speakers device must match the system-audio
          device selected above.
        </p>
      </div>
    </PageLayout>
  );
};

export default Audio;

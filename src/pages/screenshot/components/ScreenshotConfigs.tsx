import {
  Label,
  Input,
  Select as AuthoredSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Header,
} from "@/components";
import { UseSettingsReturn } from "@/types";
import { LaptopMinimalIcon, MousePointer2Icon } from "lucide-react";

export const ScreenshotConfigs = ({
  screenshotConfiguration,
  handleScreenshotModeChange,
  handleScreenshotPromptChange,
  handleScreenshotEnabledChange,
  localFeaturesEnabled,
}: UseSettingsReturn) => {
  return (
    <div id="screenshot" className="space-y-3">
      <div className="space-y-3">
        {/* Screenshot Capture Mode: Selection and Screenshot */}
        <div className="space-y-2">
          <div className="flex flex-col">
            <Header
              title="Capture Method"
              description={
                screenshotConfiguration.enabled
                  ? "Capture the entire screen with one action."
                  : "Drag to capture only the area you choose."
              }
            />
          </div>
          <AuthoredSelect
            value={screenshotConfiguration.enabled ? "screenshot" : "selection"}
            onValueChange={(value) =>
              handleScreenshotEnabledChange(value === "screenshot")
            }
          >
            <SelectTrigger aria-label="Screenshot capture method" className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                {screenshotConfiguration.enabled ? (
                  <LaptopMinimalIcon className="size-4" />
                ) : (
                  <MousePointer2Icon className="size-4" />
                )}
                <div className="text-sm font-medium">
                  {screenshotConfiguration.enabled
                    ? "Full screen"
                    : "Selected area"}
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="selection" disabled={!localFeaturesEnabled}>
                <div className="flex items-center gap-2">
                  <MousePointer2Icon className="size-4" />
                  <div className="font-medium">Selected area</div>
                  {!localFeaturesEnabled && (
                    <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                      License required
                    </span>
                  )}
                </div>
              </SelectItem>
              <SelectItem value="screenshot" className="flex flex-row gap-2">
                <LaptopMinimalIcon className="size-4" />
                <div className="font-medium">Full screen</div>
              </SelectItem>
            </SelectContent>
          </AuthoredSelect>
        </div>

        {/* Mode Selection: Auto and Manual */}
        <div className="space-y-2">
          <div className="flex flex-col">
            <Header
              title="Processing Mode"
              description={
                screenshotConfiguration.mode === "manual"
                  ? "Review one or more captures, then send them with your message."
                  : "Send each capture immediately with the prompt below."
              }
            />
          </div>
          <AuthoredSelect
            value={screenshotConfiguration.mode}
            onValueChange={handleScreenshotModeChange}
          >
            <SelectTrigger aria-label="Screenshot processing mode" className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">
                  {screenshotConfiguration.mode === "auto"
                    ? "Send automatically"
                    : "Review before sending"}
                </div>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">
                <div className="font-medium">Review before sending</div>
              </SelectItem>
              <SelectItem value="auto">
                <div className="font-medium">Send automatically</div>
              </SelectItem>
            </SelectContent>
          </AuthoredSelect>
        </div>

        {/* Auto Prompt Input - Only show when auto mode is selected */}
        {screenshotConfiguration.mode === "auto" && (
          <div className="space-y-2">
            <Label htmlFor="screenshot-auto-prompt" className="text-sm font-medium">Prompt for automatic analysis</Label>
            <Input
              id="screenshot-auto-prompt"
              placeholder="Enter prompt for automatic screenshot analysis..."
              value={screenshotConfiguration.autoPrompt}
              onChange={(e) => handleScreenshotPromptChange(e.target.value)}
              className="w-full h-11 border-1 border-input/50 focus:border-primary/50 transition-colors"
            />
            <p className="text-xs text-muted-foreground">
              Mira Desk sends this prompt with each automatic capture.
            </p>
          </div>
        )}
      </div>

    </div>
  );
};

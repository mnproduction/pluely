import { Switch, Label, Header } from "@/components";
import { useApp } from "@/contexts";
import { useState } from "react";

interface AppIconToggleProps {
  className?: string;
}

export const AppIconToggle = ({ className }: AppIconToggleProps) => {
  const { customizable, toggleAppIconVisibility } = useApp();
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState("");

  const handleSwitchChange = async (hidden: boolean) => {
    setIsApplying(true);
    setError("");
    try {
      await toggleAppIconVisibility(!hidden);
    } catch (err) {
      setError(`Could not update app icon visibility: ${err}`);
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div id="app-icon" className={`space-y-2 ${className}`}>
      <Header
        title="App Icon"
        description="Control whether Mira Desk windows appear in the dock or taskbar"
        isMainTitle
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <Label className="text-sm font-medium">
              Hide Icon from Dock/Taskbar
            </Label>
            <p className="text-xs text-muted-foreground mt-1">
              Applies to AI Assistant and Dashboard, including after reopening.
            </p>
          </div>
        </div>
        <Switch
          checked={!customizable.appIcon.isVisible}
          onCheckedChange={handleSwitchChange}
          disabled={isApplying}
          aria-label="Hide app icon from dock/taskbar"
        />
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

import {
  Theme,
  AlwaysOnTopToggle,
  AppIconToggle,
  AutostartToggle,
  DeleteChats,
} from "./components";
import { PageLayout } from "@/layouts";
import { useSettings } from "@/hooks";

const Settings = () => {
  const settings = useSettings();
  return (
    <PageLayout title="Settings" description="Manage your settings">
      {/* Theme */}
      <Theme />

      {/* Autostart Toggle */}
      <AutostartToggle />

      {/* App Icon Toggle */}
      <AppIconToggle />

      {/* Always On Top Toggle */}
      <AlwaysOnTopToggle />

      <DeleteChats {...settings} />
    </PageLayout>
  );
};

export default Settings;

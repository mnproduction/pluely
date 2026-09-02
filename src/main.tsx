import React from "react";
import ReactDOM from "react-dom/client";
import Overlay from "./components/Overlay";
import { AppProvider, ThemeProvider } from "./contexts";
import "./global.css";
import { getCurrentWindow } from "@tauri-apps/api/window";
import AppRoutes from "./routes";
import { initializePrivateStorage } from "./lib/storage/private-storage";
import { StorageStatus } from "./components/StorageStatus";

const currentWindow = getCurrentWindow();
const windowLabel = currentWindow.label;

// Render different components based on window label
if (windowLabel.startsWith("capture-overlay-")) {
  const monitorIndex = parseInt(windowLabel.split("-")[2], 10) || 0;
  // Render overlay without providers
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <Overlay monitorIndex={monitorIndex} />
    </React.StrictMode>
  );
} else {
  initializePrivateStorage().then(() => {
    ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AppProvider>
          <StorageStatus />
          <AppRoutes />
        </AppProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
  }).catch(() => {
    const root = document.getElementById("root");
    if (root) root.textContent = "Cannot open encrypted provider settings. Restart with the Windows account that saved them. No settings have been overwritten.";
  });
}

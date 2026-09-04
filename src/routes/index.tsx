import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import {
  Dashboard,
  App,
  SystemPrompts,
  ViewChat,
  Settings,
  DevSpace,
  Shortcuts,
  Audio,
  Screenshot,
  Chats,
  Responses,
  NotFound,
} from "@/pages";
import { DashboardLayout } from "@/layouts";

const DocumentTitle = ({ title, children }: { title: string; children: ReactNode }) => {
  useEffect(() => {
    document.title = `Mira Desk - ${title}`;
  }, [title]);
  return children;
};

const page = (title: string, content: ReactNode) => (
  <DocumentTitle title={title}>{content}</DocumentTitle>
);

export default function AppRoutes() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={page("Assistant", <App />)} />
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={page("Dashboard", <Dashboard />)} />
          <Route path="/chats" element={page("Conversations", <Chats />)} />
          <Route path="/system-prompts" element={page("System Prompts", <SystemPrompts />)} />
          <Route path="/chats/view/:conversationId" element={page("Conversation", <ViewChat />)} />
          <Route path="/shortcuts" element={page("Shortcuts", <Shortcuts />)} />
          <Route path="/screenshot" element={page("Screenshot", <Screenshot />)} />
          <Route path="/settings" element={page("Settings", <Settings />)} />
          <Route path="/audio" element={page("Audio", <Audio />)} />
          <Route path="/responses" element={page("Responses", <Responses />)} />
          <Route path="/dev-space" element={page("Providers", <DevSpace />)} />
          <Route path="*" element={page("Page Not Found", <NotFound />)} />
        </Route>
      </Routes>
    </Router>
  );
}

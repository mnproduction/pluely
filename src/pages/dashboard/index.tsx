import { Link } from "react-router-dom";
import { PageLayout } from "@/layouts";

export default function Dashboard() {
  return <PageLayout title="Mira Desk" description="Your providers. All local features enabled.">
    <div className="space-y-4 text-sm">
      <p>Open Dev Space, select Grok (xAI), and enter your API key and a model available to your xAI account. Select xAI Speech to Text for audio and enter the same key there.</p>
      <Link className="underline" to="/dev-space">Configure AI and speech providers</Link>
      <p>Provider settings are encrypted with Windows DPAPI. Requests go directly to the provider you choose. Chat history, transcripts, and screenshots are stored locally without application encryption. You can delete history in App Settings.</p>
      <p>Microphone, system audio, and screenshots are sent when you use their controls. Autostart is off by default.</p>
      <p className="text-muted-foreground">Based on the GPL Pluely 0.1.9 source. Local themes, shortcuts, screenshot modes, chat follow-ups, and prompt generation are available with your own provider.</p>
    </div>
  </PageLayout>;
}

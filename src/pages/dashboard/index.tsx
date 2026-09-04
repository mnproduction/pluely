import { Badge, Button, Card } from "@/components";
import { useApp } from "@/contexts";
import { PageLayout } from "@/layouts";
import {
  AudioLinesIcon,
  BotIcon,
  CheckCircle2Icon,
  KeyRoundIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const formatProviderName = (id: string) =>
  id
    .replace(/-stt$/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export default function Dashboard() {
  const navigate = useNavigate();
  const { selectedAIProvider, selectedSttProvider, selectedAudioDevices } = useApp();
  const aiReady = Boolean(selectedAIProvider.provider);
  const sttReady = Boolean(selectedSttProvider.provider);
  const audioReady = Boolean(selectedAudioDevices.input.id && selectedAudioDevices.output.id);
  const openProviders = () => navigate("/dev-space");
  const openAudio = () => navigate("/audio");

  const readiness = [
    {
      label: "AI responses",
      value: aiReady ? formatProviderName(selectedAIProvider.provider) : "Provider required",
      ready: aiReady,
      icon: BotIcon,
    },
    {
      label: "Speech to text",
      value: sttReady ? formatProviderName(selectedSttProvider.provider) : "Provider required",
      ready: sttReady,
      icon: AudioLinesIcon,
    },
    {
      label: "Two-channel audio",
      value: audioReady ? "Microphone and output selected" : "Choose both devices",
      ready: audioReady,
      icon: CheckCircle2Icon,
    },
  ];

  return (
    <PageLayout title="Mira Desk" description="Check readiness before a call">
      <section aria-labelledby="readiness-title" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 id="readiness-title" className="text-sm font-semibold">Session readiness</h2>
            <p className="mt-1 text-xs text-muted-foreground">Complete all three checks for two-channel Listen.</p>
          </div>
          <Badge variant="outline" className={aiReady && sttReady && audioReady ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : ""}>
            {[aiReady, sttReady, audioReady].filter(Boolean).length}/3 ready
          </Badge>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {readiness.map((item) => (
            <Card key={item.label} className="gap-3 p-4 shadow-none">
              <div className="flex items-center justify-between">
                <div className="flex size-9 items-center justify-center rounded-xl bg-muted">
                  <item.icon className="size-4" />
                </div>
                <span className={`size-2.5 rounded-full ${item.ready ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-sm font-medium">{item.label}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{item.value}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2" aria-label="Setup actions">
        <Card className="gap-3 p-4 shadow-none">
          <div className="flex items-start gap-3">
            <KeyRoundIcon className="mt-0.5 size-4 text-muted-foreground" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Providers</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Choose the AI and speech services used by Assistant and Listen.</p>
            </div>
          </div>
          <Button variant="outline" onClick={openProviders}>Open providers</Button>
        </Card>
        <Card className="gap-3 p-4 shadow-none">
          <div className="flex items-start gap-3">
            <AudioLinesIcon className="mt-0.5 size-4 text-muted-foreground" />
            <div className="flex-1">
              <h2 className="text-sm font-semibold">Audio devices</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Use the microphone for You and the output device for Them.</p>
            </div>
          </div>
          <Button variant="outline" onClick={openAudio}>Choose audio devices</Button>
        </Card>
      </section>

      <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-foreground" />
        <p>Provider settings are protected with Windows DPAPI. Conversation history, transcripts, and screenshots stay on this computer until you send content to the provider you selected.</p>
      </div>
    </PageLayout>
  );
}

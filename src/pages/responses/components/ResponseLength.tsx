import { Header } from "@/components";
import { RESPONSE_LENGTHS } from "@/lib";
import { useApp } from "@/contexts";
import { updateResponseLength } from "@/lib/storage/response-settings.storage";
import { useState, useEffect } from "react";
import { getResponseSettings } from "@/lib";
import { CheckCircle2 } from "lucide-react";

export const ResponseLength = () => {
  const { localFeaturesEnabled } = useApp();
  const [selectedLength, setSelectedLength] = useState<string>("auto");

  useEffect(() => {
    const settings = getResponseSettings();
    setSelectedLength(settings.responseLength);
  }, []);

  const handleLengthChange = (lengthId: string) => {
    if (!localFeaturesEnabled) {
      return;
    }
    setSelectedLength(lengthId);
    updateResponseLength(lengthId);
  };
  const selectLength = (lengthId: string) => () => handleLengthChange(lengthId);

  return (
    <div className="space-y-4">
      <Header
        title="Response Length"
        description="Control how detailed the AI responses should be. Changes apply to all new conversations and will influence how the AI structures responses"
        isMainTitle
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3" role="radiogroup" aria-label="Response length">
        {RESPONSE_LENGTHS.map((length) => (
          <button
            type="button"
            role="radio"
            aria-checked={selectedLength === length.id}
            disabled={!localFeaturesEnabled}
            key={length.id}
            className={`relative rounded-xl border p-4 text-left shadow-none transition-all focus-visible:ring-4 focus-visible:ring-ring/60 lg:border-2 ${
              selectedLength === length.id
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            } ${!localFeaturesEnabled ? "opacity-50 cursor-not-allowed" : ""}`}
            onClick={selectLength(length.id)}
          >
            <div className="space-y-1">
              <h3 className="text-sm lg:text-md font-semibold">
                {length.title}
              </h3>
              <p className="text-[10px] lg:text-xs text-muted-foreground">
                {length.description}
              </p>
            </div>
            {selectedLength === length.id && (
              <CheckCircle2 className="size-5 text-green-500 flex-shrink-0 absolute top-2 right-2" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

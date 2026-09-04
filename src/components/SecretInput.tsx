import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { Button, Input } from "./ui";
import { cn } from "@/lib/utils";

type SecretInputProps = Omit<React.ComponentProps<"input">, "type">;

export const SecretInput = ({ className, ...props }: SecretInputProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const toggleVisibility = () => setIsVisible((visible) => !visible);

  return (
    <div className="relative min-w-0 flex-1">
      <Input
        {...props}
        type={isVisible ? "text" : "password"}
        autoComplete="new-password"
        className={cn("pr-11", className)}
      />
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="absolute right-1 top-1/2 size-9 -translate-y-1/2"
        onClick={toggleVisibility}
        aria-label={isVisible ? "Hide API key" : "Show API key"}
        aria-pressed={isVisible}
        title={isVisible ? "Hide API key" : "Show API key"}
      >
        {isVisible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </Button>
    </div>
  );
};

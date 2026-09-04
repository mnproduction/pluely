import { Header, ScrollArea } from "@/components";
import { cn } from "@/lib/utils";

export const PageLayout = ({
  children,
  title,
  description,
  rightSlot,
  allowBackButton = false,
  isMainTitle = true,
  contentClassName,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  rightSlot?: React.ReactNode;
  allowBackButton?: boolean;
  isMainTitle?: boolean;
  contentClassName?: string;
}) => {
  return (
    <div className="flex flex-1 flex-col">
      <header className="pt-8">
        <Header
          isMainTitle={isMainTitle}
          showBorder={true}
          title={title}
          description={description}
          rightSlot={rightSlot}
          allowBackButton={allowBackButton}
        />
      </header>

      <ScrollArea className="h-[calc(100vh-5rem)] pr-6">
        <div
          className={cn(
            "flex min-h-full flex-col gap-6 px-1 pb-12 pt-4",
            contentClassName
          )}
        >
          {children}
        </div>
      </ScrollArea>
    </div>
  );
};

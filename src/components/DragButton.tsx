import { GripVerticalIcon } from "lucide-react";

export const DragButton = () => (
  <div
    className="-ml-[2px] flex size-9 shrink-0 cursor-grab items-center justify-center rounded-xl text-muted-foreground active:cursor-grabbing"
    data-tauri-drag-region
    aria-hidden="true"
    title="Drag Assistant. Keyboard movement is available in Cursor & Shortcuts."
  >
    <GripVerticalIcon className="size-4" />
  </div>
);

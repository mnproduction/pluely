import { useRef, useState } from "react";
import { Loader2Icon, TrashIcon } from "lucide-react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Header,
} from "@/components";
import { UseSettingsReturn } from "@/types";

export const DeleteChats = ({
  handleDeleteAllChatsConfirm,
  showDeleteConfirmDialog,
  setShowDeleteConfirmDialog,
}: UseSettingsReturn) => {
  const [isDeleting, setIsDeleting] = useState(false);
  const [status, setStatus] = useState<"success" | "error" | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const openDialog = () => {
    setStatus(null);
    setShowDeleteConfirmDialog(true);
  };

  const deleteAllChats = async () => {
    setIsDeleting(true);
    setStatus(null);
    try {
      await handleDeleteAllChatsConfirm();
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setIsDeleting(false);
    }
  };

  const focusCancel = (event: Event) => {
    event.preventDefault();
    cancelRef.current?.focus();
  };

  return (
    <div id="delete-chats" className="space-y-3">
      <Header
        title="Delete Conversation History"
        description="Permanently remove every locally saved conversation. This cannot be undone."
        isMainTitle
      />

      {status === "success" && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">Conversation history deleted.</p>}
      {status === "error" && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">Could not delete conversation history. Try again.</p>}

      <Button onClick={openDialog} disabled={isDeleting} variant="destructive">
        <TrashIcon className="size-4" />
        Delete all conversations
      </Button>

      <Dialog open={showDeleteConfirmDialog} onOpenChange={setShowDeleteConfirmDialog}>
        <DialogContent onOpenAutoFocus={focusCancel} showCloseButton={!isDeleting}>
          <DialogHeader>
            <DialogTitle>Delete all conversations?</DialogTitle>
            <DialogDescription>This permanently removes every conversation stored by Mira Desk on this computer.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button ref={cancelRef} variant="outline" disabled={isDeleting}>Cancel</Button>
            </DialogClose>
            <Button variant="destructive" onClick={deleteAllChats} disabled={isDeleting} aria-busy={isDeleting}>
              {isDeleting ? <Loader2Icon className="size-4 animate-spin" /> : <TrashIcon className="size-4" />}
              Delete all conversations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

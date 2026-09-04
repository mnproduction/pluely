import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components";

interface DeleteConfirmationDialogProps {
  deleteConfirm: string | null;
  cancelDelete: () => void;
  confirmDelete: () => void | Promise<void>;
  error?: string | null;
  isDeleting?: boolean;
}

export const DeleteConfirmationDialog = ({
  deleteConfirm,
  cancelDelete,
  confirmDelete,
  error,
  isDeleting = false,
}: DeleteConfirmationDialogProps) => {
  return (
    <Dialog
      open={Boolean(deleteConfirm)}
      onOpenChange={(open) => !open && cancelDelete()}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete conversation?</DialogTitle>
          <DialogDescription>
            This permanently removes the conversation and its local messages.
          </DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={cancelDelete} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting} aria-busy={isDeleting}>
            {isDeleting ? "Deleting..." : "Delete conversation"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

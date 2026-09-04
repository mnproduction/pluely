import { UseSettingsReturn } from "@/types";
import {
  Card,
  Button,
  Header,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components";
import { EditIcon, TrashIcon } from "lucide-react";
import { CreateEditProvider } from "./CreateEditProvider";
import { useCustomAiProviders } from "@/hooks";
import curl2Json from "@bany/curl-to-json";

const endpointLabel = (curl: string) => {
  try {
    const endpoint = new URL(curl2Json(curl)?.url || "");
    return `${endpoint.origin}${endpoint.pathname}`;
  } catch {
    return "Invalid cURL command";
  }
};

export const CustomProviders = ({ allAiProviders }: UseSettingsReturn) => {
  const customProviderHook = useCustomAiProviders();
  const {
    handleEdit,
    handleDelete,
    deleteConfirm,
    deleteError,
    isDeleting,
    confirmDelete,
    cancelDelete,
  } = customProviderHook;

  return (
    <div className="space-y-2">
      <Header
        title="Advanced: Custom AI Providers"
        description="Add a cURL endpoint when no built-in provider matches your service."
      />

      <div className="space-y-2">
        {/* Existing Custom Providers */}
        {allAiProviders.filter((provider) => provider?.isCustom).length > 0 && (
          <div className="space-y-2">
            {allAiProviders
              .filter((provider) => provider?.isCustom)
              .map((provider) => {
                return (
                  <Card
                    key={provider?.id}
                    className="p-3 border !bg-transparent border-input/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-sm">
                          {endpointLabel(provider?.curl)}
                        </h4>

                        <div className="flex items-center gap-2 mt-1">
                          <p className="text-xs text-muted-foreground">
                            {`Response Path: ${
                              provider?.responseContentPath || "Not set"
                            }`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {" • "}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Streaming: {provider?.streaming ? "Yes" : "No"}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            provider?.id && handleEdit(provider?.id)
                          }
                          title="Edit Provider"
                        >
                          <EditIcon className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            provider?.id && handleDelete(provider?.id)
                          }
                          title="Delete Provider"
                          className="text-destructive hover:text-destructive"
                        >
                          <TrashIcon className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
          </div>
        )}
      </div>
      <CreateEditProvider customProviderHook={customProviderHook} />

      <Dialog
        open={Boolean(deleteConfirm)}
        onOpenChange={(open) => !open && cancelDelete()}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete custom AI provider?</DialogTitle>
            <DialogDescription>
              This permanently removes its local endpoint configuration.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={cancelDelete} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting} aria-busy={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

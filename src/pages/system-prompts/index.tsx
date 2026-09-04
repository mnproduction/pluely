import {
  Input,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Button,
  Empty,
  Badge,
} from "@/components";
import { useSystemPrompts } from "@/hooks";
import {
  Search,
  MoreHorizontal,
  PlusIcon,
  Pencil,
  Trash2,
  CheckCircle2,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import { DeleteSystemPrompt } from "./Delete";
import { CreateEditDialog } from "./CreateEditDialog";
import { useRef, useState } from "react";
import { PageLayout } from "@/layouts";

const PromptActionsTrigger = "button";

const SystemPrompts = () => {
  const {
    prompts,
    isLoading,
    error,
    createPrompt,
    deletePrompt,
    updatePrompt,
    selectedPromptId,
    handleSelectPrompt,
    clearError,
  } = useSystemPrompts();

  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [isCreateEditDialogOpen, setIsCreateEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<{
    id?: number;
    name: string;
    prompt: string;
  }>({
    name: "",
    prompt: "",
  });

  /**
   * Handle opening create dialog
   */
  const handleCreateClick = () => {
    setForm({ name: "", prompt: "" });
    setIsCreateEditDialogOpen(true);
  };

  /**
   * Handle opening edit dialog
   */
  const handleEditClick = (promptId: number) => {
    const promptToEdit = prompts.find((p) => p.id === promptId);
    if (promptToEdit) {
      setForm({
        id: promptToEdit.id,
        name: promptToEdit.name,
        prompt: promptToEdit.prompt,
      });
      setIsCreateEditDialogOpen(true);
    }
  };

  /**
   * Handle opening delete dialog
   */
  const handleDeleteClick = (promptId: number) => {
    const promptToDelete = prompts.find((p) => p.id === promptId);
    if (promptToDelete) {
      setForm({
        id: promptToDelete.id,
        name: promptToDelete.name,
        prompt: promptToDelete.prompt,
      });
      setIsDeleteDialogOpen(true);
    }
  };

  /**
   * Handle saving (create or update)
   */
  const handleSave = async () => {
    try {
      setIsSaving(true);
      clearError();

      if (form.id) {
        // Update existing prompt
        await updatePrompt(form.id, {
          name: form.name,
          prompt: form.prompt,
        });
      } else {
        // Create new prompt
        const newPrompt = await createPrompt({
          name: form.name,
          prompt: form.prompt,
        });
        // Auto-select the newly created prompt
        handleSelectPrompt(newPrompt.id);
      }

      setForm({ name: "", prompt: "" });
      setIsCreateEditDialogOpen(false);
    } catch (err) {
      console.error("Failed to save prompt:", err);
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Handle delete confirmation
   */
  const handleDeleteConfirm = async (id: number) => {
    await deletePrompt(id);
    setForm({ name: "", prompt: "" });
    setIsDeleteDialogOpen(false);
  };

  /**
   * Handle AI generation
   */
  const handleGenerate = (
    generatedPrompt: string,
    generatedPromptName: string
  ) => {
    setForm((prev) => ({
      ...prev,
      prompt: generatedPrompt,
      name: generatedPromptName,
    }));
  };

  /**
   * Handle selecting a prompt card
   */
  const handleCardClick = (promptId: number) => {
    handleSelectPrompt(promptId);
  };
  const selectPrompt = (promptId: number) => () => handleCardClick(promptId);
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => setSearch(event.target.value);
  const clearSearch = () => {
    setSearch("");
    searchRef.current?.focus();
  };

  /**
   * Filter prompts based on search
   */
  const filteredPrompts = prompts.filter(
    (prompt) =>
      prompt.name.toLowerCase().includes(search.toLowerCase()) ||
      prompt.prompt.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <PageLayout
      title="System Prompts"
      description="Manage your AI behavior profiles and create new ones"
    >
      {/* Error Display */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3">
          <p role="alert" className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {/* Search Bar */}
      <div className="flex items-center gap-2 justify-between">
        <div className="relative w-full max-w-md select-none">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            type="text"
            aria-label="Search system prompts"
            placeholder="Search system prompts"
            className="px-9 focus-visible:ring-2"
            value={search}
            onChange={handleSearchChange}
          />
          {search && (
            <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1/2 size-7 -translate-y-1/2" onClick={clearSearch} aria-label="Clear system prompt search" title="Clear search">
              <XIcon className="size-3.5" />
            </Button>
          )}
        </div>
        <Button variant="default" size="default" onClick={handleCreateClick}>
          <PlusIcon className="size-4" />
          Create New
        </Button>
      </div>
      {filteredPrompts.length === 0 ? (
        <Empty
          isLoading={isLoading}
          icon={WandSparklesIcon}
          title={search ? "No matching prompts" : "No prompts yet"}
          description={search ? "Try a different query or clear the search" : "Create a prompt to shape Mira's responses"}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-4 pb-4">
          {[...filteredPrompts].reverse().map((prompt) => {
            const isSelected = selectedPromptId === prompt.id;
            return (
              <Card
                key={prompt.id}
                className={`relative gap-0 border p-0 pb-10 shadow-none transition-all hover:shadow-sm lg:border-2 ${
                  isSelected
                    ? "!bg-primary/5 dark:!bg-primary/10 border-primary"
                    : "!bg-black/5 dark:!bg-white/5 border-transparent"
                }`}
              >
                <button type="button" aria-pressed={isSelected} className="w-full rounded-xl p-4 text-left outline-none focus-visible:ring-4 focus-visible:ring-ring/60" onClick={selectPrompt(prompt.id)}>
                  {isSelected && (
                    <Badge className="absolute right-2 top-2" aria-label="Active for Assistant">
                      <CheckCircle2 className="size-3" /> Active
                    </Badge>
                  )}
                  <CardHeader className="select-none p-0 pb-0">
                  <div className="flex items-start justify-between gap-2 relative">
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <CardTitle className="line-clamp-1 flex-1 pr-3 text-sm">
                          {prompt.name}
                        </CardTitle>
                      </div>
                      <CardDescription className="h-14 line-clamp-3 text-xs leading-relaxed">
                        {prompt.prompt}
                      </CardDescription>
                    </div>
                  </div>
                  </CardHeader>
                </button>
                <div className="absolute inset-x-4 bottom-2 flex items-center justify-between">
                  <span className="text-[10px] lg:text-xs text-muted-foreground select-none">
                    {prompt.created_at}
                  </span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <PromptActionsTrigger
                        type="button"
                        aria-label={`Actions for ${prompt.name}`}
                        className="flex size-8 items-center justify-center rounded-xl transition-opacity hover:bg-accent"
                      >
                        <MoreHorizontal className="size-4 text-muted-foreground" />
                      </PromptActionsTrigger>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditClick(prompt.id);
                        }}
                      >
                        <Pencil className="size-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteClick(prompt.id);
                        }}
                      >
                        <Trash2 className="size-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <CreateEditDialog
        isOpen={isCreateEditDialogOpen}
        onOpenChange={setIsCreateEditDialogOpen}
        form={form}
        setForm={setForm}
        onSave={handleSave}
        onGenerate={handleGenerate}
        isEditing={!!form.id}
        isSaving={isSaving}
      />

      {/* Delete Confirmation Dialog */}
      <DeleteSystemPrompt
        isOpen={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        promptId={form.id}
        promptName={form.name}
        onDelete={handleDeleteConfirm}
      />

      {/* Pluely Default Prompts */}
    </PageLayout>
  );
};

export default SystemPrompts;

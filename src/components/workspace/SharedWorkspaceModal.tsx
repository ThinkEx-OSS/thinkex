"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { IconPicker } from "@/components/workspace/IconPicker";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { SwatchesPicker, ColorResult } from "react-color";
import { SWATCHES_COLOR_GROUPS, type CardColor } from "@/lib/workspace-state/colors";
import { Skeleton } from "@/components/ui/skeleton";
import type { Item } from "@/lib/workspace-state/types";
import { useCreateWorkspace } from "@/hooks/workspace/use-create-workspace";

interface SharedWorkspaceData {
  workspace: {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    color: CardColor | null;
    state: Item[];
  };
}

interface SharedWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

interface SharedWorkspaceModalContentProps {
  workspaceId: string;
  onImported: (slug: string) => void;
  onDismiss: () => void;
}

function SharedWorkspaceModalContent({
  workspaceId,
  onImported,
  onDismiss,
}: SharedWorkspaceModalContentProps) {
  const createWorkspace = useCreateWorkspace();
  const [formError, setFormError] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | undefined>(undefined);
  const [selectedIconOverride, setSelectedIconOverride] = useState<
    string | null | undefined
  >(undefined);
  const [selectedColorOverride, setSelectedColorOverride] = useState<
    CardColor | null | undefined
  >(undefined);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);

  const sharedWorkspaceQuery = useQuery({
    queryKey: ["shared-workspace", workspaceId],
    queryFn: async (): Promise<SharedWorkspaceData> => {
      const response = await fetch(`/api/share/${workspaceId}`);

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load workspace");
      }

      return response.json();
    },
    enabled: Boolean(workspaceId),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const workspaceData = sharedWorkspaceQuery.data ?? null;
  const isLoading = sharedWorkspaceQuery.isLoading;
  const isCreating = createWorkspace.isPending;
  const name = nameOverride ?? workspaceData?.workspace.name ?? "";
  const selectedIcon =
    selectedIconOverride ?? workspaceData?.workspace.icon ?? null;
  const selectedColor =
    selectedColorOverride ?? workspaceData?.workspace.color ?? null;
  const queryError =
    sharedWorkspaceQuery.error instanceof Error
      ? sharedWorkspaceQuery.error.message
      : null;
  const error = formError ?? queryError;

  const handleCreate = async () => {
    if (!name.trim()) {
      setFormError("Workspace name is required");
      return;
    }

    if (!workspaceData) {
      setFormError("Workspace data not loaded");
      return;
    }

    setFormError(null);

    try {
      const { workspace } = await createWorkspace.mutateAsync({
        name: name.trim(),
        template: "blank",
        is_public: false,
        icon: selectedIcon,
        color: selectedColor,
        initialItems: workspaceData.workspace.state,
      });

      toast.success("Workspace created successfully");
      onImported(workspace.slug);
    } catch (err) {
      console.error("Error creating workspace:", err);
      const errorMessage =
        err instanceof Error ? err.message : "Failed to create workspace";
      setFormError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const hasData = workspaceData !== null;
  const itemCount = workspaceData?.workspace.state?.length || 0;

  return (
      <DialogContent
        showCloseButton={false}
        className="w-full max-w-[calc(100%-2rem)] border border-border bg-background p-6 shadow-2xl sm:max-w-[600px]"
        onPointerDownOutside={(event) => {
          if (isCreating) {
            event.preventDefault();
          }
        }}
        onEscapeKeyDown={(event) => {
          if (isCreating) {
            event.preventDefault();
          }
        }}
      >
        {/* Header */}
        <DialogHeader className="mb-4">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-96" />
            </>
          ) : (
            <>
              <DialogTitle className="mb-2">Import Shared Workspace</DialogTitle>
              <p className="text-sm text-muted-foreground">
                {hasData ? (
                  `Create your own copy of "${workspaceData.workspace.name}" with ${itemCount} item${itemCount !== 1 ? 's' : ''}.`
                ) : (
                  "Import this shared workspace into your account."
                )}
              </p>
            </>
          )}
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            {isLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <Input
                id="name"
                placeholder="My Workspace"
                value={name}
                onChange={(e) => {
                  setFormError(null);
                  setNameOverride(e.target.value);
                }}
                disabled={isCreating}
                autoFocus
              />
            )}
          </div>

          {/* Icon and Color Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Icon</Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <IconPicker
                  value={selectedIcon}
                  onSelect={(icon) => {
                    setFormError(null);
                    setSelectedIconOverride(icon);
                  }}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isCreating}
                  >
                    <IconRenderer 
                      icon={selectedIcon} 
                      className="mr-2 size-4"
                      style={{ 
                        color: selectedColor || undefined,
                      }}
                    />
                    {selectedIcon ? "Change icon" : "Select icon"}
                  </Button>
                </IconPicker>
              )}
            </div>
            
            <div className="space-y-2">
              <Label>Color</Label>
              {isLoading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start"
                    disabled={isCreating}
                    onClick={() => setIsColorPickerOpen(true)}
                  >
                    <div
                      className="mr-2 size-4 rounded border border-border"
                      style={{
                        backgroundColor: selectedColor || "transparent",
                      }}
                    />
                    {selectedColor ? "Change color" : "Select color"}
                  </Button>
                  
                  {/* Color Picker Dialog */}
                  <Dialog open={isColorPickerOpen} onOpenChange={setIsColorPickerOpen}>
                    <DialogContent 
                      className="w-auto max-w-fit p-6 border-border bg-background shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <DialogHeader>
                        <DialogTitle>Choose a Color</DialogTitle>
                      </DialogHeader>
                      <div className="flex justify-center color-picker-wrapper">
                        <SwatchesPicker
                          color={selectedColor || '#3B82F6'}
                          colors={SWATCHES_COLOR_GROUPS}
                          onChangeComplete={(color: ColorResult) => {
                            setFormError(null);
                            setSelectedColorOverride(color.hex as CardColor);
                            setIsColorPickerOpen(false);
                          }}
                        />
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={onDismiss}
            disabled={isCreating}
            aria-label="Cancel import and close dialog"
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleCreate} 
            disabled={
              isCreating || 
              isLoading ||
              !hasData ||
              !name.trim()
            }
            className="w-full sm:w-auto"
          >
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Import Workspace"
            )}
          </Button>
        </div>
      </DialogContent>
  );
}

export default function SharedWorkspaceModal({
  open,
  onOpenChange,
  workspaceId,
}: SharedWorkspaceModalProps) {
  const router = useRouter();

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
    if (!newOpen) {
      router.push("/home");
    }
  };
  const handleDismiss = () => handleOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open ? (
        <SharedWorkspaceModalContent
          key={workspaceId}
          workspaceId={workspaceId}
          onDismiss={handleDismiss}
          onImported={(slug) => {
            window.location.href = `/workspace/${slug}`;
          }}
        />
      ) : null}
    </Dialog>
  );
}

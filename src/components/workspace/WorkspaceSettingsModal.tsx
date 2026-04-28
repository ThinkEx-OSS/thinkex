"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Loader2, LogOut, Trash2 } from "lucide-react";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { IconPicker } from "@/components/workspace/IconPicker";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { SwatchesPicker, ColorResult } from "react-color";
import { SWATCHES_COLOR_GROUPS, type CardColor } from "@/lib/workspace-state/colors";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";

interface WorkspaceSettingsModalProps {
  workspace: WorkspaceWithState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
}

export default function WorkspaceSettingsModal({
  workspace,
  open,
  onOpenChange,
  onUpdate,
}: WorkspaceSettingsModalProps) {
  const { deleteWorkspace, leaveWorkspace, updateWorkspaceLocal } =
    useWorkspaceContext();
  const router = useRouter();
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const isShared = workspace?.isShared ?? false;

  useEffect(() => {
    if (workspace && open) {
      setName(workspace.name);
      setSelectedIcon(workspace.icon ?? null);
      setSelectedColor(workspace.color as CardColor | null);
    }
  }, [workspace, open]);

  const handleSave = async () => {
    if (!workspace || !name.trim()) {
      setError("Workspace name is required");
      return;
    }

    setIsSaving(true);
    setError("");

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          icon: selectedIcon,
          color: selectedColor,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update workspace");
      }

      const updatedWorkspace = await response.json();

      // Update the TanStack Query cache with the new values
      updateWorkspaceLocal(workspace.id, {
        name: name.trim(),
        icon: selectedIcon,
        color: selectedColor,
      });

      toast.success("Workspace updated successfully");
      onOpenChange(false);
      if (onUpdate) {
        onUpdate();
      }

      // Check if slug changed and redirect if needed
      if (updatedWorkspace.workspace?.slug && workspace.slug !== updatedWorkspace.workspace.slug) {
        const newSlug = updatedWorkspace.workspace.slug;
        // Check if we're currently on a slug-based URL that needs updating
        const currentPath = window.location.pathname;
        const isWorkspaceRoute = currentPath.startsWith('/workspace/');
        
        if (isWorkspaceRoute) {
          // Redirect to the new slug-based URL
          router.push(`/workspace/${newSlug}`);
          toast.info("Redirecting to new workspace URL...");
        } else {
          // If not on workspace route, just show success
          toast.success("Workspace URL updated - it will be reflected when you navigate to the workspace");
        }
      }
    } catch (err) {
      console.error("Error updating workspace:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to update workspace";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!workspace) return;

    setIsDeleting(true);
    try {
      await deleteWorkspace(workspace.id);
      setShowDeleteDialog(false);
      onOpenChange(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error("Error deleting workspace:", err);
      setError(err instanceof Error ? err.message : "Failed to delete workspace");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleLeaveClick = () => {
    setShowLeaveDialog(true);
  };

  const handleLeaveConfirm = async () => {
    if (!workspace) return;

    setIsLeaving(true);
    try {
      await leaveWorkspace(workspace.id);
      setShowLeaveDialog(false);
      onOpenChange(false);
      if (onUpdate) {
        onUpdate();
      }
    } catch (err) {
      console.error("Error leaving workspace:", err);
      setError(err instanceof Error ? err.message : "Failed to leave workspace");
    } finally {
      setIsLeaving(false);
    }
  };

  if (!workspace) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="sm:max-w-[600px] max-h-[80vh] flex flex-col"
        >
          <DialogHeader>
            <DialogTitle>Workspace Settings</DialogTitle>
            <DialogDescription>
              Manage workspace details
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col min-h-0 space-y-4 py-4">
                {/* Name */}
                <div className="space-y-2">
                  <Label htmlFor="edit-name">Name *</Label>
                  <Input
                    id="edit-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isSaving}
                  />
                </div>

                {/* Icon and Color Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Icon</Label>
                    <IconPicker value={selectedIcon} onSelect={setSelectedIcon}>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start"
                        disabled={isSaving}
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
                  </div>

                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full justify-start"
                        disabled={isSaving}
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
                          className="w-auto max-w-fit p-6"
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
                                setSelectedColor(color.hex as CardColor);
                                setIsColorPickerOpen(false);
                              }}
                            />
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>

                {/* Error Message */}
                {error && (
                  <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
                    {error}
                  </div>
                )}

                <Separator className="my-4" />

                {/* Danger Zone — Delete (owner) or Leave (collaborator) */}
                <div className="space-y-2">
                  <Label className="text-destructive mb-3 block">Danger Zone</Label>
                  {isShared ? (
                    <div className="flex items-center justify-between p-3 rounded-md border border-destructive/20 bg-destructive/5">
                      <div>
                        <p className="text-sm font-medium">Leave Workspace</p>
                        <p className="text-xs text-muted-foreground">
                          Remove yourself from this workspace. You&apos;ll lose access to all its content. The owner can re-invite you later.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleLeaveClick}
                        disabled={isSaving || isLeaving}
                      >
                        <LogOut className="h-4 w-4 mr-2" />
                        Leave
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between p-3 rounded-md border border-destructive/20 bg-destructive/5">
                      <div>
                        <p className="text-sm font-medium">Delete Workspace</p>
                        <p className="text-xs text-muted-foreground">
                          Delete this workspace and all its data. This action cannot be undone right now.
                        </p>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleDeleteClick}
                        disabled={isSaving || isDeleting}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isDeleting || isLeaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isDeleting || isLeaving || !name.trim()}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent
          className=""
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{workspace?.name}&quot;? This will
              delete all data in this workspace. This action cannot be undone right now.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Leave Confirmation Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent
          className=""
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Leave Workspace</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to leave &quot;{workspace?.name}&quot;? You&apos;ll lose
              access to all its content. The owner can re-invite you later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isLeaving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleLeaveConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isLeaving}
            >
              {isLeaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


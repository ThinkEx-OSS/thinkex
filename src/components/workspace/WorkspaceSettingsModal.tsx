"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth-client";
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
import { Tabs, TabsList, TabsTrigger, TabsContents, TabsContent } from "@/components/ui/shadcn-io/tabs";
import { Separator } from "@/components/ui/separator";
import { Loader2, Copy, Check, Trash2 } from "lucide-react";
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
  const { deleteWorkspace, updateWorkspaceLocal } = useWorkspaceContext();
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Share link state (for fork-based sharing)
  const [shareUrl, setShareUrl] = useState("");
  const [copiedShareUrl, setCopiedShareUrl] = useState(false);

  useEffect(() => {
    if (workspace && open) {
      setName(workspace.name);
      setSelectedIcon(workspace.icon ?? null);
      setSelectedColor(workspace.color as CardColor | null);

      // Generate share URL for fork-based sharing
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      setShareUrl(`${baseUrl}/share-copy/${workspace.id}`);
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
    } catch (err) {
      console.error("Error updating workspace:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to update workspace";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedShareUrl(true);
      setTimeout(() => setCopiedShareUrl(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
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
              Manage workspace details and sharing
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="sharing">Sharing</TabsTrigger>
            </TabsList>

            <TabsContents>
              <TabsContent value="general" className="space-y-4 py-4">
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

                {/* Delete Workspace */}
                <div className="space-y-2">
                  <Label className="text-destructive mb-3 block">Danger Zone</Label>
                  <div className="flex items-center justify-between p-3 rounded-md border border-destructive/20 bg-destructive/5">
                    <div>
                      <p className="text-sm font-medium">Delete Workspace</p>
                      <p className="text-xs text-muted-foreground">
                        Permanently delete this workspace and all its data. This action cannot be undone.
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
                </div>
              </TabsContent>

              <TabsContent value="sharing" className="space-y-4 py-4">
                <div className="space-y-4">
                  {/* Share Workspace Link */}
                  <div className="space-y-2">
                    <div>
                      <Label>Share Link</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Share this link to allow others to fork your workspace. They'll get their own copy—changes to their copy won't affect your original.
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        value={shareUrl}
                        readOnly
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleCopyShareUrl}
                        className="flex-shrink-0"
                      >
                        {copiedShareUrl ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    {copiedShareUrl && (
                      <p className="text-sm text-muted-foreground">Copied to clipboard!</p>
                    )}
                  </div>
                </div>
              </TabsContent>
            </TabsContents>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving || isDeleting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isDeleting || !name.trim()}>
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
              Are you sure you want to delete &quot;{workspace?.name}&quot;? This action
              cannot be undone and will permanently delete all data in this workspace.
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
    </>
  );
}


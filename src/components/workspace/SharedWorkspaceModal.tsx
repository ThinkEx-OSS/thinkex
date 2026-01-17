"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { usePostHog } from 'posthog-js/react';
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
import type { AgentState } from "@/lib/workspace-state/types";
import { cn } from "@/lib/utils";

interface SharedWorkspaceData {
  workspace: {
    id: string;
    name: string;
    description: string;
    icon: string | null;
    color: CardColor | null;
    state: AgentState;
  };
}

interface SharedWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

export default function SharedWorkspaceModal({
  open,
  onOpenChange,
  workspaceId,
}: SharedWorkspaceModalProps) {
  const router = useRouter();
  const posthog = usePostHog();
  const [workspaceData, setWorkspaceData] = useState<SharedWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [name, setName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Fetch workspace data when modal opens
  useEffect(() => {
    if (open && workspaceId) {
      const fetchWorkspaceData = async () => {
        try {
          setLoading(true);
          setError(null);
          const response = await fetch(`/api/share/${workspaceId}`);

          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || "Failed to load workspace");
          }

          const data = await response.json() as SharedWorkspaceData;
          setWorkspaceData(data);
          
          // Pre-fill form with shared workspace data
          setName(data.workspace.name || "");
          setSelectedIcon(data.workspace.icon || null);
          setSelectedColor(data.workspace.color || null);
        } catch (err) {
          console.error("Error fetching workspace data:", err);
          setError(err instanceof Error ? err.message : "Failed to load workspace");
        } finally {
          setLoading(false);
        }
      };

      fetchWorkspaceData();
    }
  }, [open, workspaceId]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Workspace name is required");
      return;
    }

    if (!workspaceData) {
      setError("Workspace data not loaded");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          template: "blank",
          is_public: false,
          icon: selectedIcon,
          color: selectedColor,
          initialState: workspaceData.workspace.state,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to create workspace");
      }

      const { workspace } = await response.json();

      posthog.capture('workspace-created-from-share', {
        workspace_id: workspace.id,
        workspace_slug: workspace.slug,
        shared_workspace_id: workspaceId,
        imported_items_count: workspaceData.workspace.state?.items?.length || 0,
      });

      toast.success("Workspace created successfully");
      
      // Close modal first
      onOpenChange(false);
      
      // Use full page navigation to ensure workspace context and state are properly loaded
      // This ensures a clean reload where the workspace will be found by slug
      window.location.href = `/dashboard/${workspace.slug}`;
    } catch (err) {
      console.error("Error creating workspace:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to create workspace";
      setError(errorMessage);
      toast.error(errorMessage);
      setIsCreating(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isCreating) {
      onOpenChange(newOpen);
      if (!newOpen) {
        router.push("/home");
      }
    }
  };

  // Handle escape key
  useEffect(() => {
    if (!open) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isCreating) {
        handleOpenChange(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCreating]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isLoading = loading;
  const hasData = workspaceData !== null;
  const itemCount = workspaceData?.workspace.state?.items?.length || 0;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay - transparent */}
      <div
        className="fixed inset-0 transition-opacity"
        onClick={() => handleOpenChange(false)}
      />
      
      {/* Modal Content */}
      <div
        className="relative z-50 w-full max-w-[calc(100%-2rem)] sm:max-w-[600px] rounded-md bg-background shadow-2xl p-6 transition-all border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-4">
          {isLoading ? (
            <>
              <Skeleton className="h-6 w-48 mb-2" />
              <Skeleton className="h-4 w-96" />
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold leading-none mb-2">Import Shared Workspace</h2>
              <p className="text-sm text-muted-foreground">
                {hasData ? (
                  `Create your own copy of "${workspaceData.workspace.name}" with ${itemCount} item${itemCount !== 1 ? 's' : ''}.`
                ) : (
                  "Import this shared workspace into your account."
                )}
              </p>
            </>
          )}
        </div>

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
                onChange={(e) => setName(e.target.value)}
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
                <IconPicker value={selectedIcon} onSelect={setSelectedIcon}>
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
                            setSelectedColor(color.hex as CardColor);
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
        <div className="flex justify-end mt-6">
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
      </div>
    </div>
  );
}


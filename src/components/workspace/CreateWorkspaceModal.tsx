"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { usePostHog } from 'posthog-js/react';
import { useCreateWorkspace } from "@/hooks/workspace/use-create-workspace";
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
import { Loader2, UserPlus, X } from "lucide-react";
import { WORKSPACE_TEMPLATES } from "@/lib/workspace/templates";
import type { WorkspaceTemplate } from "@/lib/workspace-state/types";
import { IconPicker } from "@/components/workspace/IconPicker";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { SwatchesPicker, ColorResult } from "react-color";
import { SWATCHES_COLOR_GROUPS, type CardColor } from "@/lib/workspace-state/colors";
import { validateImportedJSON, generateImportPreview, type ValidationResult } from "@/lib/workspace/import-validation";
import { Textarea } from "@/components/ui/textarea";
import { Upload, FileText } from "lucide-react";
import type { AgentState } from "@/lib/workspace-state/types";


interface Workspace {
  id: string;
  slug: string;
  name: string;
  state?: {
    items?: Array<unknown>;
  };
}

interface CreateWorkspaceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (workspaceSlug: string, workspaceData?: Workspace) => void;
  initialData?: {
    name?: string;
    description?: string;
    icon?: string | null;
    color?: CardColor | null;
    initialState?: AgentState;
  };
}

export default function CreateWorkspaceModal({
  open,
  onOpenChange,
  onSuccess,
  initialData,
}: CreateWorkspaceModalProps) {
  const router = useRouter();
  const posthog = usePostHog();
  const createWorkspace = useCreateWorkspace();
  const [name, setName] = useState(initialData?.name || "");
  const [selectedIcon, setSelectedIcon] = useState<string | null>(initialData?.icon || null);
  const [selectedColor, setSelectedColor] = useState<CardColor | null>(initialData?.color || null);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<WorkspaceTemplate>("blank");
  const [error, setError] = useState("");
  const [importMode, setImportMode] = useState<"template" | "json">(initialData?.initialState ? "json" : "template");
  const [jsonInput, setJsonInput] = useState(initialData?.initialState ? JSON.stringify(initialData.initialState, null, 2) : "");
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  // Collaboration state
  const [inviteEmail, setInviteEmail] = useState("");
  const [pendingInvites, setPendingInvites] = useState<Array<{ email: string; permission: "viewer" | "editor" }>>([]);

  // Initialize form when initialData changes or modal opens
  useEffect(() => {
    if (open && initialData) {
      setName(initialData.name || "");
      setSelectedIcon(initialData.icon || null);
      setSelectedColor(initialData.color || null);
      if (initialData.initialState) {
        setImportMode("json");
        const jsonString = JSON.stringify(initialData.initialState, null, 2);
        setJsonInput(jsonString);
        const result = validateImportedJSON(jsonString);
        setValidationResult(result);
      } else {
        setImportMode("template");
        setJsonInput("");
        setValidationResult(null);
      }
    }
  }, [open, initialData]);

  // Handle JSON input validation
  const handleJsonInputChange = (value: string) => {
    setJsonInput(value);
    if (value.trim()) {
      const result = validateImportedJSON(value);
      setValidationResult(result);
      if (!result.isValid) {
        setError(result.error || "Invalid JSON");
      } else {
        setError("");
      }
    } else {
      setValidationResult(null);
      setError("");
    }
  };

  const handleAddInvite = () => {
    const email = inviteEmail.trim();
    if (!email) return;

    // Check for valid email format
    if (!email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    // Check if already in list
    if (pendingInvites.some(inv => inv.email === email)) {
      setError("This email is already in the invite list");
      return;
    }

    setPendingInvites([...pendingInvites, { email, permission: "editor" }]);
    setInviteEmail("");
    setError("");
  };

  const handleRemoveInvite = (email: string) => {
    setPendingInvites(pendingInvites.filter(inv => inv.email !== email));
  };

  const handleCreate = () => {
    if (!name.trim()) {
      setError("Workspace name is required");
      return;
    }

    if (importMode === "json" && (!validationResult?.isValid || !validationResult.data)) {
      setError("Please provide valid JSON data");
      return;
    }

    setError("");

    createWorkspace.mutate(
      {
        name: name.trim(),
        template: importMode === "template" ? selectedTemplate : "blank",
        is_public: false,
        icon: selectedIcon,
        color: selectedColor,
        initialState: importMode === "json" && validationResult?.data ? validationResult.data : undefined,
      },
      {
        onSuccess: async ({ workspace }) => {
          posthog.capture('workspace-created', {
            workspace_id: workspace.id,
            workspace_slug: workspace.slug,
            template: importMode === "template" ? selectedTemplate : "imported",
            import_mode: importMode,
            has_icon: !!selectedIcon,
            has_color: !!selectedColor,
            color: selectedColor,
            imported_items_count: importMode === "json" && validationResult?.data ? validationResult.data.items.length : 0,
            pending_invites_count: pendingInvites.length,
          });

          // Send pending invites if any
          if (pendingInvites.length > 0) {
            let successCount = 0;
            for (const invite of pendingInvites) {
              try {
                const response = await fetch(`/api/workspaces/${workspace.id}/collaborators`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    email: invite.email,
                    permissionLevel: invite.permission,
                  }),
                });

                if (response.ok) {
                  successCount++;
                }
              } catch (err) {
                console.error(`Failed to invite ${invite.email}`, err);
              }
            }

            if (successCount > 0) {
              if (successCount === pendingInvites.length) {
                toast.success(`Workspace created and ${successCount} invite${successCount > 1 ? 's' : ''} sent!`);
              } else {
                toast.success(`Workspace created. ${successCount}/${pendingInvites.length} invites sent successfully.`);
              }
            } else {
              toast.success("Workspace created, but failed to send invites");
            }
          } else {
            toast.success("Workspace created successfully");
          }

          // Reset form
          setName("");
          setSelectedIcon(null);
          setSelectedColor(null);
          setSelectedTemplate("blank");
          setImportMode("template");
          setJsonInput("");
          setValidationResult(null);
          setPendingInvites([]);
          setInviteEmail("");
          onOpenChange(false);

          // Call success callback or navigate (use slug, not ID)
          if (onSuccess) {
            onSuccess(workspace.slug, workspace);
          } else {
            router.push(`/workspace/${workspace.slug}`);
          }
        },
        onError: (err) => {
          console.error("Error creating workspace:", err);
          const errorMessage = err instanceof Error ? err.message : "Failed to create workspace";
          setError(errorMessage);
          toast.error(errorMessage);
        },
      }
    );
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!createWorkspace.isPending) {
      onOpenChange(newOpen);
      if (!newOpen) {
        // Reset form when closing (unless we have initialData from share)
        if (!initialData) {
          setName("");
          setSelectedIcon(null);
          setSelectedColor(null);
          setSelectedTemplate("blank");
          setImportMode("template");
          setJsonInput("");
          setValidationResult(null);
          setPendingInvites([]);
          setInviteEmail("");
          setError("");
        } else {
          // Reset to initialData values when closing share modal
          setName(initialData.name || "");
          setSelectedIcon(initialData.icon || null);
          setSelectedColor(initialData.color || null);
          if (initialData.initialState) {
            setImportMode("json");
            setJsonInput(JSON.stringify(initialData.initialState, null, 2));
            const result = validateImportedJSON(JSON.stringify(initialData.initialState, null, 2));
            setValidationResult(result);
          } else {
            setImportMode("template");
            setJsonInput("");
            setValidationResult(null);
          }
          setError("");
        }
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[600px] border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl"
        style={{
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <DialogHeader>
          <DialogTitle>Create New Workspace</DialogTitle>
          <DialogDescription>
            Set up a new workspace to organize your projects, notes, and ideas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="My Workspace"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={createWorkspace.isPending}
              autoFocus
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
                  disabled={createWorkspace.isPending}
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
                  disabled={createWorkspace.isPending}
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
                    className="w-auto max-w-fit p-6 border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl"
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

          {/* Collaboration Invites Section */}
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-muted-foreground" />
                <Label className="text-sm font-medium">Invite Collaborators (Optional)</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Add team members to collaborate on this workspace in real-time.
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="name@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddInvite()}
                className="flex-1"
                disabled={createWorkspace.isPending}
              />
              <Button
                type="button"
                onClick={handleAddInvite}
                disabled={createWorkspace.isPending || !inviteEmail.trim()}
              >
                Add
              </Button>
            </div>

            {/* Pending Invites List */}
            {pendingInvites.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  {pendingInvites.length} pending invite{pendingInvites.length > 1 ? 's' : ''}
                </p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.email}
                      className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate">{invite.email}</span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveInvite(invite.email)}
                        disabled={createWorkspace.isPending}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={createWorkspace.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              createWorkspace.isPending ||
              !name.trim() ||
              (importMode === "json" && (!validationResult?.isValid || !validationResult.data))
            }
          >
            {createWorkspace.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Mail, UserPlus, Users, Trash2, Loader2, Clock, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import type { WorkspaceEvent } from "@/lib/workspace/events";
import { useSession } from "@/lib/auth-client";
import { VersionHistoryContent } from "@/components/workspace/VersionHistoryModal";

interface Collaborator {
  id: string;
  userId: string;
  email?: string;
  name?: string;
  image?: string;
  permissionLevel: "viewer" | "editor" | "owner";
  createdAt: string;
}

interface FrequentCollaborator {
  userId: string;
  name?: string;
  email?: string;
  image?: string;
  lastCollaboratedAt: string;
  collaborationCount: number;
}

interface ShareWorkspaceDialogProps {
  workspace: WorkspaceWithState | null;
  workspaceIds?: string[]; // For bulk selection
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Version history props (optional, only for workspace routes)
  showHistoryTab?: boolean;
  events?: WorkspaceEvent[];
  currentVersion?: number;
  onRevertToVersion?: (version: number) => Promise<void>;
}

export default function ShareWorkspaceDialog({
  workspace,
  workspaceIds,
  open,
  onOpenChange,
  showHistoryTab = false,
  events = [],
  currentVersion = 0,
  onRevertToVersion,
}: ShareWorkspaceDialogProps) {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"viewer" | "editor">("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
  const [frequentCollaborators, setFrequentCollaborators] = useState<FrequentCollaborator[]>([]);
  const [isLoadingFrequent, setIsLoadingFrequent] = useState(false);

  // Bulk mode check
  const isBulk = !!workspaceIds && workspaceIds.length > 1;
  const targetIds = isBulk ? workspaceIds! : (workspace ? [workspace.id] : []);

  // Determine permissions (simplified for bulk: assume logic handled in loop or backend returns error)
  const isOwner = workspace?.userId === session?.user?.id;

  // Find current user in collaborators list (if not owner)
  const currentUserCollaborator = collaborators.find(c => c.userId === session?.user?.id);

  // Can invite: Owner OR Editor (In bulk mode, we assume user can try, and API will reject if not allowed)
  const canInvite = isBulk || isOwner || currentUserCollaborator?.permissionLevel === 'editor';

  // Can manage (remove/change permission): Only Owner
  const canManage = isOwner;

  useEffect(() => {
    if (workspace && open && !isBulk) {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${baseUrl}/share/${workspace.id}`;
      setShareUrl(url);
      loadCollaborators();
    }
    if (open) {
      loadFrequentCollaborators();
    }
  }, [workspace, open, isBulk]);

  const loadCollaborators = async () => {
    if (!workspace || isBulk) return;

    setIsLoadingCollaborators(true);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/collaborators`);
      if (response.ok) {
        const data = await response.json();
        setCollaborators(data.collaborators || []);
      }
    } catch (error) {
      console.error("Failed to load collaborators:", error);
    } finally {
      setIsLoadingCollaborators(false);
    }
  };

  const loadFrequentCollaborators = async () => {
    setIsLoadingFrequent(true);
    try {
      const response = await fetch("/api/collaborators/frequent");
      if (response.ok) {
        const data = await response.json();
        setFrequentCollaborators(data.collaborators || []);
      }
    } catch (error) {
      console.error("Failed to load frequent collaborators:", error);
    } finally {
      setIsLoadingFrequent(false);
    }
  };

  const handleCopy = async () => {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  const handleEmailShare = () => {
    const shareTitle = workspace?.name || "Workspace";
    const shareText = `Check out this workspace: ${shareTitle}`;
    const emailBody = `Check out this workspace on ThinkEx: ${shareUrl}`;
    const emailUrl = `mailto:?subject=${encodeURIComponent(shareText)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = emailUrl;
  };

  const handleQuickAddCollaborator = async (collaborator: FrequentCollaborator) => {
    if (!collaborator.email) {
      toast.error("Collaborator email not found");
      return;
    }

    setIsInviting(true);
    const email = collaborator.email;
    let successCount = 0;

    try {
      for (const id of targetIds) {
        try {
          const response = await fetch(`/api/workspaces/${id}/collaborators`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email,
              permissionLevel: "editor",
            }),
          });

          if (response.ok) {
            successCount++;
          }
        } catch (err) {
          console.error(`Failed to invite to ${id}`, err);
        }
      }

      const total = targetIds.length;
      if (successCount === total) {
        toast.success(`Added ${collaborator.name || email} to ${isBulk ? 'all workspaces' : 'workspace'}`);
        if (!isBulk) loadCollaborators();
      } else if (successCount > 0) {
        toast.warning(`Added ${collaborator.name || email} to ${successCount}/${total} workspaces (some failed)`);
      } else {
        toast.error("Failed to add collaborator. They may already have access.");
      }

    } catch (error) {
      console.error("Failed to add collaborator:", error);
      toast.error("Failed to add collaborator");
    } finally {
      setIsInviting(false);
    }
  };

  const handleInvite = async () => {
    if ((!workspace && !isBulk) || !inviteEmail.trim()) return;

    setIsInviting(true);
    const email = inviteEmail.trim();
    let successCount = 0;

    try {
      for (const id of targetIds) {
        try {
          const response = await fetch(`/api/workspaces/${id}/collaborators`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              email: email,
              permissionLevel: invitePermission,
            }),
          });

          if (response.ok) {
            successCount++;
          }
        } catch (err) {
          console.error(`Failed to invite to ${id}`, err);
        }
      }

      const total = targetIds.length;
      if (successCount === total) {
        toast.success(`Invited ${email} to ${isBulk ? 'all workspaces' : 'workspace'}`);
        setInviteEmail("");
        if (!isBulk) loadCollaborators();
      } else if (successCount > 0) {
        toast.warning(`Invited ${email} to ${successCount}/${total} workspaces (some failed due to permissions)`);
        setInviteEmail("");
      } else {
        toast.error("Failed to send invites. Check if user is already a collaborator or your permissions.");
      }

    } catch (error) {
      console.error("Failed to invite:", error);
      toast.error("Failed to send invite");
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!workspace) return;

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/collaborators/${collaboratorId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        toast.success("Collaborator removed");
        loadCollaborators();
      } else {
        toast.error("Failed to remove collaborator");
      }
    } catch (error) {
      console.error("Failed to remove collaborator:", error);
      toast.error("Failed to remove collaborator");
    }
  };

  const handleUpdatePermission = async (collaboratorId: string, newPermission: "viewer" | "editor") => {
    if (!workspace) return;

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/collaborators/${collaboratorId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissionLevel: newPermission }),
      });

      if (response.ok) {
        toast.success("Permission updated");
        loadCollaborators();
      } else {
        toast.error("Failed to update permission");
      }
    } catch (error) {
      console.error("Failed to update permission:", error);
      toast.error("Failed to update permission");
    }
  };

  const getInitials = (name?: string, email?: string) => {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return "??";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg border-white/20 bg-black/40 backdrop-blur-2xl shadow-2xl"
        style={{
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <DialogHeader>
          <DialogTitle>{isBulk ? `Share ${workspaceIds?.length} Workspaces` : "Share Workspace"}</DialogTitle>
          <DialogDescription>
            {isBulk
              ? "Invite collaborators to all selected workspaces at once."
              : "Invite collaborators to work together in real-time or share a link for others to fork."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="invite" className="w-full">
          <TabsList className={`grid w-full ${isBulk ? 'grid-cols-1' : showHistoryTab ? 'grid-cols-3' : 'grid-cols-2'}`}>
            <TabsTrigger value="invite" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Collaborate
            </TabsTrigger>
            {!isBulk && (
              <TabsTrigger value="link" className="flex items-center gap-2">
                <Copy className="h-4 w-4" />
                Share Copy
              </TabsTrigger>
            )}
            {!isBulk && showHistoryTab && (
              <TabsTrigger value="history" className="flex items-center gap-2">
                <History className="h-4 w-4" />
                History
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="invite" className="space-y-4 mt-4">

            {/* Frequent Collaborators Section */}
            {frequentCollaborators.length > 0 && (
              <div className="space-y-2 pb-2 border-b border-white/10">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span>Frequent Collaborators</span>
                </div>
                {isLoadingFrequent ? (
                  <div className="flex items-center justify-center py-3">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {frequentCollaborators.slice(0, 6).map((collab) => (
                      <div
                        key={collab.userId}
                        className="group flex items-center justify-between p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                        onClick={() => handleQuickAddCollaborator(collab)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={collab.image} />
                            <AvatarFallback className="text-[10px] bg-primary/20 text-primary-foreground">
                              {getInitials(collab.name, collab.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate group-hover:text-primary transition-colors">
                              {collab.name || collab.email}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[10px] opacity-0 group-hover:opacity-100 transition-all duration-200"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickAddCollaborator(collab);
                          }}
                          disabled={isInviting || !canInvite}
                        >
                          Add
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Invite Form */}
            <div className="space-y-3">
              <Label htmlFor="invite-email">Invite by email</Label>
              <div className="flex gap-2">
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                  className="flex-1"
                  disabled={!canInvite}
                />
                <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim() || !canInvite}>
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
                </Button>
              </div>
              {!canInvite && (
                <p className="text-xs text-red-400">
                  You must be an editor or owner to invite others.
                </p>
              )}

            </div>

            {/* Collaborators List - Only show for single workspace */}
            {!isBulk && (
              <div className="space-y-2 pt-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>People with access ({collaborators.length})</span>
                </div>

                {isLoadingCollaborators ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : collaborators.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No collaborators yet. Invite someone above!
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {collaborators.map((collab) => (
                      <div
                        key={collab.id}
                        className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={collab.image} />
                            <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                              {getInitials(collab.name, collab.email)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {collab.name || collab.email || "Unknown"}
                            </p>
                            {collab.name && collab.email && (
                              <p className="text-xs text-muted-foreground truncate">
                                {collab.email}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {collab.permissionLevel === "owner" ? (
                            <span className="text-xs font-medium text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">
                              Owner
                            </span>
                          ) : (
                            canManage && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleRemoveCollaborator(collab.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="link" className="space-y-4 mt-4">

            <div className="space-y-2">
              <Label htmlFor="share-url">Share Link (Copy)</Label>
              <div className="flex gap-2">
                <Input
                  id="share-url"
                  value={shareUrl}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="flex-shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {copied && (
                <p className="text-sm text-muted-foreground">Copied to clipboard!</p>
              )}
            </div>

            <div className="space-y-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleEmailShare}
                className="w-full flex items-center gap-2"
              >
                <Mail className="h-4 w-4" />
                <span>Share via Email</span>
              </Button>
            </div>
          </TabsContent>

          {/* History Tab - only shown on workspace routes */}
          {!isBulk && showHistoryTab && (
            <TabsContent value="history" className="space-y-4 mt-4">
              <div className="space-y-1">
                <h3 className="font-medium">Version History</h3>
                <p className="text-xs text-muted-foreground">
                  View and manage versions of this workspace.
                </p>
              </div>

              {/* Embed the version history content inline */}
              <div className="max-h-[400px] overflow-y-auto pr-2">
                <VersionHistoryContent
                  events={events}
                  currentVersion={currentVersion || 0}
                  onRevertToVersion={onRevertToVersion || (() => { })}
                  items={workspace?.state?.items || []}
                  workspaceId={workspace?.id || null}
                  isOpen={open}
                />
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

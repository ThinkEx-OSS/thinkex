"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Mail, UserPlus, Users, Trash2, Loader2 } from "lucide-react";
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
import { useSession } from "@/lib/auth-client";

interface Collaborator {
  id: string;
  userId: string;
  email?: string;
  name?: string;
  image?: string;
  permissionLevel: "viewer" | "editor" | "owner";
  createdAt: string;
}

interface ShareWorkspaceDialogProps {
  workspace: WorkspaceWithState | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ShareWorkspaceDialog({
  workspace,
  open,
  onOpenChange,
}: ShareWorkspaceDialogProps) {
  const { data: session } = useSession();
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"viewer" | "editor">("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);

  // Determine permissions
  const isOwner = workspace?.userId === session?.user?.id;

  // Find current user in collaborators list (if not owner)
  const currentUserCollaborator = collaborators.find(c => c.userId === session?.user?.id);

  // Can invite: Owner OR Editor
  const canInvite = isOwner || currentUserCollaborator?.permissionLevel === 'editor';

  // Can manage (remove/change permission): Only Owner
  const canManage = isOwner;

  useEffect(() => {
    if (workspace && open) {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
      const url = `${baseUrl}/share/${workspace.id}`;
      setShareUrl(url);
      loadCollaborators();
    }
  }, [workspace, open]);

  const loadCollaborators = async () => {
    if (!workspace) return;

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

  const handleInvite = async () => {
    if (!workspace || !inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/collaborators`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          permissionLevel: invitePermission,
        }),
      });

      if (response.ok) {
        toast.success(`Invited ${inviteEmail} as ${invitePermission}`);
        setInviteEmail("");
        loadCollaborators();
      } else {
        const error = await response.json();
        toast.error(error.message || "Failed to send invite");
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
          <DialogTitle>Share Workspace</DialogTitle>
          <DialogDescription>
            Invite collaborators to work together in real-time or share a link for others to fork.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="invite" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="invite" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite
            </TabsTrigger>
            <TabsTrigger value="link" className="flex items-center gap-2">
              <Copy className="h-4 w-4" />
              Share Link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invite" className="space-y-4 mt-4">
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
                <Select
                  value={invitePermission}
                  onValueChange={(v: string) => setInvitePermission(v as "viewer" | "editor")}
                  disabled={!canInvite}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleInvite} disabled={isInviting || !inviteEmail.trim() || !canInvite}>
                  {isInviting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
                </Button>
              </div>
              {!canInvite && (
                <p className="text-xs text-red-400">
                  You must be an editor or owner to invite others.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Editors can add and edit cards. Viewers can only view.
              </p>
            </div>

            {/* Collaborators List */}
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
          </TabsContent>

          <TabsContent value="link" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="share-url">Share Link (Fork)</Label>
              <p className="text-xs text-muted-foreground">
                Anyone with this link can fork your workspace. They'll get their own copy—changes won't affect your original.
              </p>
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

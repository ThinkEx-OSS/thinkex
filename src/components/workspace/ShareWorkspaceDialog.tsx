"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Mail, Trash2, Loader2, Share2, Copy, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface PendingInvite {
  id: string;
  email: string;
  permissionLevel: string;
  createdAt: string;
  expiresAt: string;
  inviterId: string;
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
}

export default function ShareWorkspaceDialog({
  workspace,
  workspaceIds,
  open,
  onOpenChange,
}: ShareWorkspaceDialogProps) {
  const { data: session } = useSession();
  const isAnonymous = session?.user?.isAnonymous ?? false;
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState<"viewer" | "editor">("editor");
  const [isInviting, setIsInviting] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
  const [frequentCollaborators, setFrequentCollaborators] = useState<FrequentCollaborator[]>([]);
  const [isLoadingFrequent, setIsLoadingFrequent] = useState(false);

  // Pending Invites State
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [isRevoking, setIsRevoking] = useState<string | null>(null);

  // Share link state
  const [shareLinkUrl, setShareLinkUrl] = useState("");
  const [isLoadingShareLink, setIsLoadingShareLink] = useState(false);
  const [copied, setCopied] = useState(false);

  // Bulk mode check
  const isBulk = !!workspaceIds && workspaceIds.length > 1;
  const targetIds = isBulk ? workspaceIds! : (workspace ? [workspace.id] : []);

  // Determine permissions (simplified for bulk: assume logic handled in loop or backend returns error)
  const isOwner = workspace?.userId === session?.user?.id;

  // Find current user in collaborators list (if not owner)
  const currentUserCollaborator = collaborators.find(c => c.userId === session?.user?.id);

  // Can invite: Owner OR Editor (In bulk mode, we assume user can try, and API will reject if not allowed)
  const canInvite = !isAnonymous && (isBulk || isOwner || currentUserCollaborator?.permissionLevel === 'editor');

  // Can manage (remove/change permission): Only Owner
  const canManage = !isAnonymous && isOwner;

  useEffect(() => {
    if (workspace && open && !isBulk) {
      if (!isAnonymous) {
        loadCollaborators();
      } else {
        setCollaborators([]);
        setInvites([]);
      }
    }
    if (open) {
      if (!isAnonymous) {
        loadFrequentCollaborators();
      } else {
        setFrequentCollaborators([]);
      }
    }
  }, [workspace, open, isBulk, isAnonymous]);

  useEffect(() => {
    if (workspace && open && !isBulk && canInvite) {
      setIsLoadingShareLink(true);
      setShareLinkUrl("");
      fetch(`/api/workspaces/${workspace.id}/share-link`, { method: "POST" })
        .then((res) => res.json())
        .then((data) => {
          if (data.url) setShareLinkUrl(data.url);
        })
        .catch(console.error)
        .finally(() => setIsLoadingShareLink(false));
    } else {
      setShareLinkUrl("");
    }
  }, [workspace, open, isBulk, canInvite]);

  const loadCollaborators = async () => {
    if (!workspace || isBulk) return;

    setIsLoadingCollaborators(true);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/collaborators`);
      if (response.ok) {
        const data = await response.json();
        setCollaborators(data.collaborators || []);
        // Set pending invites
        setInvites(data.invites || []);
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

  const handleQuickAddCollaborator = async (collaborator: FrequentCollaborator) => {
    if (isAnonymous) {
      toast.error("Sign in to collaborate");
      return;
    }
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
            const data = await response.json();
            if (data.warning) toast.warning(data.warning);
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
    if (isAnonymous) {
      toast.error("Sign in to collaborate");
      return;
    }
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
            const data = await response.json();
            if (data.warning) toast.warning(data.warning);
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
    if (isAnonymous) {
      toast.error("Sign in to collaborate");
      return;
    }
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

  const handleRevokeInvite = async (inviteId: string) => {
    if (isAnonymous) {
      toast.error("Sign in to collaborate");
      return;
    }
    if (!workspace) return;
    setIsRevoking(inviteId);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/invites/${inviteId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        toast.success("Invite revoked");
        setInvites(prev => prev.filter(i => i.id !== inviteId));
      } else {
        toast.error("Failed to revoke invite");
      }
    } catch (e) {
      toast.error("Failed to revoke invite");
    } finally {
      setIsRevoking(null);
    }
  };

  const handleUpdatePermission = async (collaboratorId: string, newPermission: "viewer" | "editor") => {
    if (isAnonymous) {
      toast.error("Sign in to collaborate");
      return;
    }
    if (!workspace) return;

    // Optimistic update
    setCollaborators(prev => prev.map(c =>
      c.id === collaboratorId ? { ...c, permissionLevel: newPermission } : c
    ));

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/collaborators/${collaboratorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionLevel: newPermission })
      });

      if (response.ok) {
        toast.success("Permission updated");
      } else {
        throw new Error("Failed to update");
      }
    } catch (error) {
      console.error("Failed to update permission:", error);
      toast.error("Failed to update permission");
      // Revert on failure
      loadCollaborators();
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

  const handleCopyShareLink = async () => {
    if (shareLinkUrl) {
      try {
        await navigator.clipboard.writeText(shareLinkUrl);
        setCopied(true);
        toast.success("Link copied");
        setTimeout(() => setCopied(false), 2000);
      } catch {
        toast.error("Failed to copy");
      }
    }
  };

  const dialogTitle = isBulk
    ? `Share ${workspaceIds?.length} Workspaces`
    : "Work together in real-time";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg border backdrop-blur-2xl shadow-2xl"
        style={{
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-4 pr-12">
          <DialogTitle className="flex-1 min-w-0 truncate">{dialogTitle}</DialogTitle>
        </DialogHeader>
        {isBulk && (
          <DialogDescription>Invite collaborators to all selected workspaces at once.</DialogDescription>
        )}

        <div className="min-w-0 space-y-4">
            <div className="space-y-4">
              {isAnonymous && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm">
                    Sign in to invite collaborators and manage access.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Link href="/auth/sign-in" className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">
                        Sign in
                      </Button>
                    </Link>
                    <Link href="/auth/sign-up" className="flex-1">
                      <Button size="sm" className="w-full">
                        Sign up
                      </Button>
                    </Link>
                  </div>
                </div>
              )}

              {/* Invite Form */}
              <div className="space-y-3">

                <div className="flex gap-2">
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="name@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                    className="flex-1"
                    disabled={!canInvite}
                  />
                  <div>
                    <Select
                      value={invitePermission}
                      onValueChange={(val: "viewer" | "editor") => setInvitePermission(val)}
                      disabled={!canInvite || isInviting}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[9999]">
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
              {!isBulk && !isAnonymous && (
                <div className="space-y-4">

                  <div className="space-y-2">
                    {isLoadingCollaborators ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {/* Active Collaborators */}
                        {collaborators.filter((c) => c.permissionLevel !== "owner").length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4 text-center">
                            No collaborators yet. Invite someone above!
                          </p>
                        ) : (
                          collaborators
                            .filter((collab) => collab.permissionLevel !== "owner")
                            .map((collab) => (
                            <div
                              key={collab.id}
                              className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
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
                              <div className="flex items-center gap-1">
                                <div>
                                  <Select
                                    value={collab.permissionLevel}
                                    onValueChange={(val: "viewer" | "editor") => handleUpdatePermission(collab.id, val)}
                                    disabled={!canManage}
                                  >
                                    <SelectTrigger className="h-8 text-xs border-0 !bg-transparent dark:!bg-transparent shadow-none outline-none focus-visible:ring-0 focus-visible:ring-offset-0 hover:!bg-muted/50 dark:hover:!bg-muted/50">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="z-[9999]">
                                      <SelectItem value="viewer">Viewer</SelectItem>
                                      <SelectItem value="editor">Editor</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {canManage && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveCollaborator(collab.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          ))
                        )}

                        {/* Pending Invites */}
                        {!isLoadingCollaborators && invites.map((invite) => (
                          <div key={invite.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 border border-dashed">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate opacity-80">{invite.email}</p>
                                <p className="text-xs text-muted-foreground">Invited as {invite.permissionLevel}</p>
                              </div>
                            </div>
                            {canManage && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs text-muted-foreground hover:text-red-400"
                                onClick={() => handleRevokeInvite(invite.id)}
                                disabled={isRevoking === invite.id}
                              >
                                {isRevoking === invite.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Revoke"
                                )}
                              </Button>
                            )}
                          </div>
                        ))}

                        {/* Frequent collaborators inline */}
                        {(() => {
                          const availableQuickAdd = frequentCollaborators.filter(
                            (fc) => !collaborators.some((c) => c.userId === fc.userId)
                          );
                          if (isLoadingFrequent || availableQuickAdd.length === 0) return null;
                          return (
                          <div className={`pt-2 mt-2 ${collaborators.filter((c) => c.permissionLevel !== "owner").length > 0 || invites.length > 0 ? "border-t border-border/50" : ""}`}>
                            <p className="text-xs text-muted-foreground mb-2 px-1">Quick add</p>
                            {availableQuickAdd.slice(0, 6).map((collab) => (
                              <div
                                key={collab.userId}
                                className="group flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                                onClick={() => handleQuickAddCollaborator(collab)}
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage src={collab.image} />
                                    <AvatarFallback className="text-xs bg-primary/20 text-primary-foreground">
                                      {getInitials(collab.name, collab.email)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                                      {collab.name || collab.email}
                                    </p>
                                    {collab.email && (
                                      <p className="text-xs text-muted-foreground truncate">{collab.email}</p>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
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
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
        </div>

        {!isBulk && canInvite && (
          <DialogFooter className="flex-col gap-3 sm:flex-row sm:items-end sm:gap-4 pt-4 border-t">
            <div className="flex flex-col gap-2 w-full">
              <p className="text-sm text-muted-foreground">Or, send a link to invite someone</p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={shareLinkUrl}
                  className="flex-1 font-mono text-sm bg-muted/50"
                  placeholder={isLoadingShareLink ? "Loading..." : ""}
                />
                <Button
                  onClick={handleCopyShareLink}
                  disabled={!shareLinkUrl || isLoadingShareLink}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  <span className="ml-2">Copy</span>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Your invite link expires in 7 days.</p>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

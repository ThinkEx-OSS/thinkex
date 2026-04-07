"use client";

import { Fragment, useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBaseURL } from "@/lib/base-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2, Copy, Plus, Trash2, ChevronDown } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";

interface AccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountModal({ open, onOpenChange }: AccountModalProps) {
  const { data: session } = useSession();

  if (!session) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[min(90vh,100dvh)] flex flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <div className="shrink-0 border-b px-6 py-4 pr-14">
          <DialogHeader className="text-left">
            <DialogTitle>Account Settings</DialogTitle>
          </DialogHeader>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
          <div className="space-y-6">
            <ProfileForm user={session.user} />
            <MCPAccessSection />
            <DangerZone />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ProfileForm({ user }: { user: any }) {
  const [isLoading, setIsLoading] = useState(false);
  const [name, setName] = useState(user.name || "");

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await authClient.updateUser({
        name,
      });
      toast.success("Profile updated successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleUpdateProfile} className="space-y-4">
      <div className="flex items-center gap-4 mb-6">
        <Avatar className="h-16 w-16">
          <AvatarImage src={user.image} />
          <AvatarFallback>{user.name?.charAt(0) || "U"}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <span className="font-medium text-lg">{user.name}</span>
          <span className="text-sm text-muted-foreground">{user.email}</span>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="name">Display Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save Changes
        </Button>
      </div>
    </form>
  );
}

interface APIKey {
  id: string;
  prefix: string;
  label: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

function MCPAccessSection() {
  const [open, setOpen] = useState(false);
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [newKeyData, setNewKeyData] = useState<{ rawKey: string; prefix: string } | null>(null);
  const [label, setLabel] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<string | null>(null);

  const fetchKeys = async () => {
    try {
      const res = await fetch("/api/mcp-keys");
      if (!res.ok) {
        console.error("Failed to load API keys:", res.status, res.statusText);
        toast.error("Failed to load API keys");
        setLoadFailed(true);
        return;
      }
      const data = await res.json();
      setKeys(data.keys || []);
      setLoadFailed(false);
    } catch (error) {
      toast.error("Failed to load API keys");
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open && keys.length === 0 && !loadFailed) {
      setIsLoading(true);
      fetchKeys();
    }
  }, [open]);

  const handleCreateKey = async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/mcp-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label || null }),
      });

      if (!res.ok) throw new Error("Failed to create API key");

      const data = await res.json();
      setNewKeyData({ rawKey: data.rawKey, prefix: data.prefix });
      setShowCreateDialog(false);
      setShowKeyModal(true);
      setLabel("");
      await fetchKeys();
    } catch (error) {
      toast.error("Failed to create API key");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await fetch(`/api/mcp-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke API key");

      toast.success("API key revoked successfully");
      await fetchKeys();
    } catch (error) {
      toast.error("Failed to revoke API key");
    } finally {
      setKeyToRevoke(null);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen} className="border-t">
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between text-left group cursor-pointer pt-6">
            <div>
              <h3 className="text-lg font-medium">MCP Access</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                API keys for IDE integrations via the Model Context Protocol.
              </p>
            </div>
            <ChevronDown
              className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="pt-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : loadFailed ? (
            <div className="text-sm text-destructive">
              Failed to load API keys. Please try again.
            </div>
          ) : keys.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Key Prefix</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>{key.label || <span className="text-muted-foreground italic">Unlabeled</span>}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{key.prefix}...</code>
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(key.createdAt)}</TableCell>
                      <TableCell className="text-sm">{formatDate(key.lastUsedAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Revoke key ${key.label || key.prefix}`}
                          onClick={() => setKeyToRevoke(key.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create API Key
          </Button>

          <IDEConfigSection copyToClipboard={copyToClipboard} />
        </CollapsibleContent>
      </Collapsible>

      <AlertDialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Give this API key a label to help you identify it later (optional).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="key-label">Label (optional)</Label>
            <Input
              id="key-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., My MacBook"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCreating}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleCreateKey();
              }}
              disabled={isCreating}
            >
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showKeyModal} onOpenChange={(open) => { setShowKeyModal(open); if (!open) setNewKeyData(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>API Key Created</AlertDialogTitle>
            <AlertDialogDescription>
              Copy this key now. You will not be able to see it again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <div className="flex items-center gap-2">
              <Input
                value={newKeyData?.rawKey || ""}
                readOnly
                className="font-mono text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                aria-label="Copy API key"
                onClick={() => copyToClipboard(newKeyData?.rawKey || "")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This key will not be shown again. Store it in a secure location.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => { setShowKeyModal(false); setNewKeyData(null); }}>
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={keyToRevoke !== null} onOpenChange={() => setKeyToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke the API key. Any applications using this key will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (keyToRevoke) handleRevokeKey(keyToRevoke);
              }}
              className="bg-red-500 hover:bg-red-600"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function IDEConfigSection({ copyToClipboard }: { copyToClipboard: (text: string) => void }) {
  const mcpUrl = `${getBaseURL()}/api/mcp`;

  const snippet = () => `{
  "mcpServers": {
    "thinkex": {
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`;

  const claudeCodeSnippet = `{
  "mcpServers": {
    "thinkex": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer <your-api-key>"
      }
    }
  }
}`;

  const cursorGlobal = snippet();
  const cursorProject = snippet();
  const vscode = snippet();

  const ideTabs = [
    {
      value: "cursor-global",
      tabLabel: "Cursor — global",
      fileLabel: "~/.cursor/mcp.json",
      code: cursorGlobal,
      hint: "Applies to all your Cursor projects. Create the file if it doesn't exist.",
    },
    {
      value: "cursor-project",
      tabLabel: "Cursor — project",
      fileLabel: ".cursor/mcp.json",
      code: cursorProject,
      hint: "Place this inside the root of a specific project. Useful for per-project keys.",
    },
    {
      value: "vscode",
      tabLabel: "VS Code",
      fileLabel: ".vscode/mcp.json",
      code: vscode,
      hint: "Requires the MCP extension for VS Code. Place in the project root.",
    },
    {
      value: "claude-code",
      tabLabel: "Claude Code",
      fileLabel: ".mcp.json",
      code: claudeCodeSnippet,
      hint: 'Place .mcp.json in your project root. Claude Code requires the "type": "http" field for remote servers.',
    },
  ] as const;

  return (
    <div className="mt-6">
      <h4 className="text-sm font-medium mb-1">IDE Configuration</h4>
      <p className="text-xs text-muted-foreground mb-3">
        Create (or edit) the config file shown below and paste the snippet inside.
        After saving, your IDE will discover the ThinkEx MCP server automatically.
      </p>

      <Tabs defaultValue="cursor-global">
        <TabsList className="mb-3 h-auto min-h-8 w-full min-w-0 flex-wrap items-center justify-start gap-0 px-1 py-1">
          {ideTabs.map((tab, index) => (
            <Fragment key={tab.value}>
              {index > 0 ? (
                <span
                  className="pointer-events-none mx-1.5 h-5 w-px shrink-0 self-center rounded-full bg-gradient-to-b from-border/15 via-border to-border/15"
                  aria-hidden
                />
              ) : null}
              <TabsTrigger value={tab.value} className="text-xs px-3 h-7">
                {tab.tabLabel}
              </TabsTrigger>
            </Fragment>
          ))}
        </TabsList>

        {ideTabs.map(({ value, fileLabel, code, hint }) => (
          <TabsContent key={value} value={value} className="mt-0">
            <div className="rounded-lg border bg-muted/40 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
                <code className="text-xs font-mono text-muted-foreground">{fileLabel}</code>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs gap-1"
                  onClick={() => copyToClipboard(code)}
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
              </div>
              <pre className="p-3 text-xs overflow-x-auto leading-relaxed">{code}</pre>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{hint}</p>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function DangerZone() {
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      const res = await authClient.deleteUser();

      if (res.error) {
        throw new Error(res.error.message || "Failed to delete account");
      }

      toast.success("Account deleted successfully");
      window.location.href = "/";
    } catch (error: any) {
      toast.error(error.message);
      setIsDeleting(false);
      setShowDeleteAlert(false);
    }
  };

  return (
    <>
      <div className="border-t pt-6">
        <h3 className="text-lg font-medium text-destructive mb-2">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Permanently delete your account and all of your content. This action cannot be undone.
        </p>
        <Button
          variant="destructive"
          onClick={() => setShowDeleteAlert(true)}
        >
          Delete Account
        </Button>
      </div>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete your account
              and remove your data from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDeleteAccount();
              }}
              className="bg-red-500 hover:bg-red-600 focus:ring-red-500 text-white"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

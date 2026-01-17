"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MoreVertical, LogOut, Layers, User, Mail, Play, Users, Globe, Plus, Upload, Tag, Home } from "lucide-react";
import { useState, useCallback, memo } from "react";
import { useSession, signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

// import { useOnboardingStatus } from "@/hooks/user/use-onboarding-status";
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import CreateWorkspaceModal from "@/components/workspace/CreateWorkspaceModal";
import SidebarCardList from "@/components/workspace/SidebarCardList";
import WorkspaceList from "@/components/workspace/WorkspaceList";
import WorkspaceItem from "@/components/workspace/WorkspaceItem";
import WorkspaceSettingsModal from "@/components/workspace/WorkspaceSettingsModal";
import ShareWorkspaceDialog from "@/components/workspace/ShareWorkspaceDialog";
import { SidebarQuickActions } from "./SidebarQuickActions";
import { AccountModal } from "@/components/auth/AccountModal";
import { useWorkspaceContext } from "@/contexts/WorkspaceContext";
import { useWorkspaceStore } from "@/lib/stores/workspace-store";
import { useUIStore } from "@/lib/stores/ui-store";
// import { useJoyride } from "@/contexts/JoyrideContext";
import type { WorkspaceWithState } from "@/lib/workspace-state/types";
import { IconRenderer } from "@/hooks/use-icon-picker";
import { cn } from "@/lib/utils";

interface WorkspaceSidebarProps {
  showJsonView: boolean;
  setShowJsonView: (show: boolean) => void;
  onWorkspaceSwitch?: (workspaceId: string) => void;
  showCreateModal?: boolean;
  setShowCreateModal?: (show: boolean) => void;
  isChatExpanded?: boolean;
  setIsChatExpanded?: (expanded: boolean) => void;
}


function WorkspaceSidebar({
  showJsonView,
  setShowJsonView,
  onWorkspaceSwitch,
  showCreateModal: externalShowCreateModal,
  setShowCreateModal: externalSetShowCreateModal,
  isChatExpanded,
  setIsChatExpanded,
}: WorkspaceSidebarProps) {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  // Get workspace context
  const {
    workspaces,
    loadingWorkspaces,
    loadWorkspaces,
    currentSlug,
    switchWorkspace,
  } = useWorkspaceContext();

  // Get current workspace ID from Zustand store (moved in Phase 3)
  const currentWorkspaceId = useWorkspaceStore((state) => state.currentWorkspaceId);

  // Get clearActiveFolder from UI store to navigate to root level
  const clearActiveFolder = useUIStore((state) => state.clearActiveFolder);

  // Get Joyride context for tour functionality
  // const { startTour } = useJoyride();

  // UI state
  const [internalShowCreateModal, setInternalShowCreateModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);

  // Use external state if provided, otherwise use internal
  const showCreateModal = externalShowCreateModal ?? internalShowCreateModal;
  const setShowCreateModal = externalSetShowCreateModal ?? setInternalShowCreateModal;
  const [selectedWorkspace, setSelectedWorkspace] = useState<WorkspaceWithState | null>(null);
  const [shareWorkspace, setShareWorkspace] = useState<WorkspaceWithState | null>(null);

  // Get user display information
  const userName = session?.user?.name || session?.user?.email || "User";
  const userEmail = session?.user?.email || "";
  const userImage = session?.user?.image || undefined;

  // Get initials for avatar fallback
  const getInitials = (name: string) => {
    if (name === "User") return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  const handleWorkspaceClick = useCallback((workspaceSlug: string) => {
    onWorkspaceSwitch?.(workspaceSlug);
  }, [onWorkspaceSwitch]);

  const handleSettingsClick = useCallback((workspace: WorkspaceWithState) => {
    setSelectedWorkspace(workspace);
    setShowSettingsModal(true);
  }, []);

  const handleShareClick = useCallback((workspace: WorkspaceWithState) => {
    setShareWorkspace(workspace);
    setShowShareDialog(true);
  }, []);

  const handleWorkspaceUpdate = useCallback(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);


  const handleShowCreateModal = useCallback(() => {
    setShowCreateModal(true);
  }, [setShowCreateModal]);
  const handleShowJsonViewToggle = useCallback(() => {
    setShowJsonView(!showJsonView);
  }, [setShowJsonView, showJsonView]);

  // Onboarding status for dev toggle
  // const { profile, refetchProfile } = useOnboardingStatus();
  const isDev = process.env.NODE_ENV === "development";

  // const handleToggleOnboarding = useCallback(async () => {
  //   if (!isDev) return;

  //   try {
  //     const response = await fetch("/api/user/onboarding", {
  //       method: "POST",
  //       headers: { "Content-Type": "application/json" },
  //       body: JSON.stringify({ toggle: true }),
  //     });

  //     if (response.ok) {
  //       await refetchProfile();
  //     }
  //   } catch (error) {
  //     console.error("Failed to toggle onboarding status:", error);
  //   }
  // }, [isDev, refetchProfile]);

  const handleOpenUserProfile = useCallback(() => {
    setShowAccountModal(true);
  }, []);

  const handleSignOut = useCallback(() => {
    signOut();
    router.push("/");
  }, [router]);

  return (
    <>
      <SidebarHeader className="bg-sidebar" data-tour="sidebar">
        <div className="flex items-center justify-between py-2 px-3 min-h-[3rem] group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
          <Link
            href="/"
            className="flex items-center gap-2 group-data-[collapsible=icon]:hidden transition-all duration-[400ms] group/logo cursor-pointer"
            style={{
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <div className="relative h-6 w-6 flex items-center justify-center transition-transform group-hover/logo:scale-105">
              <Image
                src="/newlogothinkex.svg"
                alt="ThinkEx Logo"
                width={24}
                height={24}
                className="object-contain"
              />
            </div>
            <h2 className="text-lg font-medium whitespace-nowrap -mb-0.5">ThinkEx</h2>
          </Link>
          <Link
            href="/home"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors cursor-pointer group-data-[collapsible=icon]:hidden"
            )}
            aria-label="Home"
          >
            <Home className="h-4 w-4" />
            <span className="sr-only">Home</span>
          </Link>
        </div>
      </SidebarHeader>

      <SidebarContent className="overflow-hidden flex flex-col">
        {/* Workspaces Section */}
        <SidebarGroup className="flex-1 min-h-0 flex flex-col">
          <SidebarGroupContent className="flex-1 min-h-0 flex flex-col">
            {loadingWorkspaces ? (
              <div className="px-3 py-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                Loading cards...
              </div>
            ) : currentSlug ? (
              <div data-tour="workspace-list" className="flex flex-col flex-1 min-h-0">
                {(() => {
                  const currentWorkspace = workspaces.find((w) => w.slug === currentSlug);
                  if (!currentWorkspace) return null;

                  return (
                    <>
                      {/* Fixed section: Quick actions and active workspace */}
                      <div className="flex-shrink-0">
                        {currentWorkspaceId && (
                          <SidebarQuickActions
                            currentWorkspaceId={currentWorkspaceId}
                            isChatExpanded={isChatExpanded}
                            setIsChatExpanded={setIsChatExpanded}
                          />
                        )}

                        <SidebarMenu>
                          <SidebarMenuItem>
                            <SidebarMenuSub className="mr-0 pr-0 border-l-0 px-1 ml-0">
                              <div className="relative border border-sidebar-border/50 rounded-md">
                                <WorkspaceItem
                                  workspace={currentWorkspace}
                                  isActive={false} // Don't highlight as "selected" context
                                  index={undefined} // Disable drag-and-drop
                                  onWorkspaceClick={() => {
                                    // Navigate to root level of workspace (similar to breadcrumb)
                                    clearActiveFolder();
                                  }}
                                  onSettingsClick={handleSettingsClick}
                                  onShareClick={handleShareClick}
                                />
                              </div>
                            </SidebarMenuSub>
                          </SidebarMenuItem>
                        </SidebarMenu>
                      </div>

                      {/* Scrollable section: Workspace content */}
                      <div className="flex-1 min-h-0 overflow-y-auto pl-4">
                        <SidebarCardList />
                      </div>
                    </>
                  );
                })()}
              </div >
            ) : (
              <div className="flex-1 min-h-0 overflow-y-auto">
                <WorkspaceList
                  workspaces={workspaces}
                  currentWorkspaceId={currentWorkspaceId || undefined}
                  currentSlug={currentSlug}
                  onCreateWorkspace={handleShowCreateModal}
                  onWorkspaceClick={handleWorkspaceClick}
                  onSettingsClick={handleSettingsClick}
                  onShareClick={handleShareClick}
                />
              </div>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="py-1.5">
        {session?.user?.isAnonymous ? (
          // Anonymous user footer - Sign in/Sign up
          <div className="flex flex-col gap-2 px-2 py-2 w-full">
            <p className="text-sm text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
              Sign in to save your work and use unlimited AI
            </p>
            <div className="flex items-center gap-2">
              <Link href="/auth/sign-in" className="flex-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs w-full group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:px-2"
                >
                  <span className="group-data-[collapsible=icon]:hidden">Sign in</span>
                  <span className="group-data-[collapsible=icon]:inline hidden">In</span>
                </Button>
              </Link>
              <Link href="/auth/sign-up" className="flex-1">
                <Button
                  size="sm"
                  className="h-7 text-xs w-full group-data-[collapsible=icon]:w-auto group-data-[collapsible=icon]:px-2"
                >
                  <span className="group-data-[collapsible=icon]:hidden">Sign up</span>
                  <span className="group-data-[collapsible=icon]:inline hidden">Up</span>
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          // Authenticated user footer - Profile and Support
          <SidebarMenu>
            {/* Single row with Guide, Support, and Profile */}
            <SidebarMenuItem>
              <div className="flex items-center gap-1.5 w-full" data-tour="help-support-group">
                {/* Profile avatar */}
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <SidebarMenuButton
                        size="default"
                        className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground h-auto p-1.5 group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:min-h-[42px] group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 cursor-pointer"
                        suppressHydrationWarning
                      >
                        <Avatar className="h-7 w-7 rounded-md">
                          {userImage && <AvatarImage src={userImage} alt={userName} />}
                          <AvatarFallback className="rounded-md bg-primary/10 text-xs">
                            {getInitials(userName)}
                          </AvatarFallback>
                        </Avatar>
                      </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="w-[--radix-dropdown-menu-trigger-width] min-w-52 rounded-lg"
                      side="top"
                      align="end"
                      sideOffset={4}
                    >
                      <DropdownMenuItem
                        onClick={handleShowJsonViewToggle}
                        className="cursor-pointer"
                      >
                        <Layers className="mr-2 h-4 w-4" />
                        <span>{showJsonView ? "Card View" : "JSON View"}</span>
                      </DropdownMenuItem>
                      {/* {isDev && (
                        <DropdownMenuItem
                          onClick={handleToggleOnboarding}
                          className="cursor-pointer"
                        >
                          <Play className="mr-2 h-4 w-4" />
                          <span>
                            Toggle Onboarding ({profile?.onboardingCompleted ? "Completed" : "Pending"})
                          </span>
                        </DropdownMenuItem>
                      )} */}
                      {/* ConnectButton removed */}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleOpenUserProfile}
                        className="cursor-pointer"
                      >
                        <User className="mr-2 h-4 w-4" />
                        <span>Account</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={handleSignOut}
                        className="cursor-pointer"
                      >
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Sign out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Support button */}
                <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
                  <SidebarMenuButton
                    size="default"
                    id="posthog-feedback-button"
                    className="px-2 py-2 cursor-pointer gap-2"
                  >
                    <Mail className="h-5 w-5" />
                    <span>Give feedback</span>
                  </SidebarMenuButton>
                </div>
              </div>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>

      {/* Modals */}
      <CreateWorkspaceModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSuccess={(workspaceSlug) => {
          loadWorkspaces();
          handleWorkspaceClick(workspaceSlug);
        }}
      />

      <WorkspaceSettingsModal
        workspace={selectedWorkspace}
        open={showSettingsModal}
        onOpenChange={setShowSettingsModal}
        onUpdate={handleWorkspaceUpdate}
      />

      <ShareWorkspaceDialog
        workspace={shareWorkspace}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />

      <AccountModal
        open={showAccountModal}
        onOpenChange={setShowAccountModal}
      />
    </>
  );
}

// Memoize component with custom comparison to prevent unnecessary re-renders
export default memo(WorkspaceSidebar, (prevProps, nextProps) => {
  // Only re-render if these specific values change
  return (
    prevProps.showJsonView === nextProps.showJsonView &&
    prevProps.onWorkspaceSwitch === nextProps.onWorkspaceSwitch &&
    prevProps.setShowJsonView === nextProps.setShowJsonView &&
    prevProps.showCreateModal === nextProps.showCreateModal &&
    prevProps.setShowCreateModal === nextProps.setShowCreateModal &&
    prevProps.isChatExpanded === nextProps.isChatExpanded
  );
});

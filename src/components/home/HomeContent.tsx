"use client";

import Link from "next/link";
import { HomePromptInput } from "./HomePromptInput";
// import { FeaturedWorkspaces } from "./FeaturedWorkspaces";
import { WorkspaceGrid } from "./WorkspaceGrid";
import { FloatingWorkspaceCards } from "@/components/landing/FloatingWorkspaceCards";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FolderPlus } from "lucide-react";

export function HomeContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleCreateBlankWorkspace = async () => {
    try {
      const createRes = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          name: "Blank Workspace",
          icon: null,
          color: null,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create workspace");
      }
      const { workspace } = (await createRes.json()) as { workspace: { slug: string } };
      
      // Invalidate workspaces cache so the new workspace is available immediately
      await queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      
      router.push(`/workspace/${workspace.slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error("Could not create workspace", { description: msg });
    }
  };

  return (
    <div className="relative h-full w-full overflow-y-auto">
      {/* Floating Card Background */}
      <div className="absolute inset-0 z-0 select-none pointer-events-none overflow-hidden">
        <FloatingWorkspaceCards 
          bottomGradientHeight="40%" 
          opacity="opacity-10 md:opacity-15"
          includeExtraCards={true}
        />
      </div>

      {/* Hero Section - Vertically centered in viewport */}
      <div className="relative z-10 min-h-[90vh] flex flex-col items-center justify-center text-center px-6 py-0">
        <div className="w-full max-w-2xl -mt-16 relative">
          {/* Border blur overlay around prompt */}
          <div 
            className="absolute -inset-6 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle, rgba(0, 0, 0, 0.4) 0%, rgba(0, 0, 0, 0.2) 40%, transparent 60%)',
              filter: 'blur(12px)',
              zIndex: 0,
              width: 'calc(100% + 3rem)',
              height: '200px',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
          
          <h1 className="text-2xl md:text-3xl font-light text-foreground mb-10 relative z-10">
            What we think, we become.
          </h1>
          <div className="flex justify-center w-full relative z-10">
            <HomePromptInput />
          </div>
          
          {/* Start from scratch button */}
          <div className="flex justify-center w-full relative z-10 mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreateBlankWorkspace}
              className="text-sm text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-all duration-200 gap-2"
            >
              <FolderPlus className="h-4 w-4" />
              Or, start from scratch
            </Button>
          </div>
        </div>
      </div>

      {/* Content Sections - Below hero */}
      <div className="relative z-10 px-6 pb-8">
        <div className="w-full max-w-6xl mx-auto space-y-12">
          {/* Featured Workspaces */}
          {/* <FeaturedWorkspaces /> */}

          {/* Your Workspaces */}
          <div className="bg-sidebar rounded-md p-6">
            <h2 className="text-lg font-normal text-muted-foreground mb-4">Recent workspaces</h2>
            <WorkspaceGrid />
          </div>
        </div>
      </div>
    </div>
  );
}

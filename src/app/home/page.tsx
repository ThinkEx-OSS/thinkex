import { Suspense } from "react";
import { SEO } from "@/components/seo/SEO";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { HomeContent } from "@/components/home/HomeContent";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";

// Home page content component
function HomePageContent() {
  return (
    <HomeLayout>
      <HomeContent />
    </HomeLayout>
  );
}

// Main shell component for home page
export function HomeShell() {
  return (
    <>
      <MobileWarning />
      <AnonymousSessionHandler>
        <Suspense
          fallback={
            <div className="flex min-h-[60vh] items-center justify-center">
              Loading...
            </div>
          }
        >
          <WorkspaceProvider>
            <HomePageContent />
          </WorkspaceProvider>
        </Suspense>
      </AnonymousSessionHandler>
    </>
  );
}

export default function HomePage() {
  return (
    <>
      <SEO
        title="Home"
        description="Choose a workspace or create a new one to start organizing your knowledge in ThinkEx."
        keywords="home, workspaces, dashboard, productivity tools"
        url="https://thinkex.app/home"
        canonical="https://thinkex.app/home"
      />
      <HomeShell />
    </>
  );
}

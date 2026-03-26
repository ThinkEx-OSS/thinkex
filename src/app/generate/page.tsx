import { Suspense } from "react";
import { HomeLayout } from "@/components/layout/HomeLayout";
import { AnonymousSessionHandler } from "@/components/layout/SessionHandler";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { MobileWarning } from "@/components/ui/MobileWarning";
import { GeneratePageClient } from "./GeneratePageClient";

export default function GeneratePage() {
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
            <HomeLayout>
              <GeneratePageClient />
            </HomeLayout>
          </WorkspaceProvider>
        </Suspense>
      </AnonymousSessionHandler>
    </>
  );
}

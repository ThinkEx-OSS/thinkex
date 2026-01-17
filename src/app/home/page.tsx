import { SEO } from "@/components/seo/SEO";
import { DashboardShell } from "../dashboard/page";

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
      <DashboardShell />
    </>
  );
}

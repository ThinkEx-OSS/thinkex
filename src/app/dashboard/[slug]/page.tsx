/**
 * Dynamic route for workspace slugs: /dashboard/[slug]
 * This imports and renders the same dashboard content as /dashboard
 */
import DashboardPage from "../page";

export default function WorkspacePage() {
  return <DashboardPage />;
}


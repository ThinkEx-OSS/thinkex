import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LandingPage } from "@/components/landing/LandingPage";

export const dynamic = "force-dynamic";

export default async function Page() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session) redirect("/home");
  } catch {
    // If auth check fails, show landing page
  }
  return <LandingPage />;
}

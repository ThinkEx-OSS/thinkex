import { authViewPaths } from "@daveyplate/better-auth-ui/server";
import { AuthPageBackground } from "@/components/auth/AuthPageBackground";
import { AuthViewWrapper } from "@/components/auth/AuthViewWrapper";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.values(authViewPaths).map((path) => ({ path }));
}

export default async function AuthPage({
  params,
  searchParams
}: {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ redirect_url?: string }>;
}) {
  const { path } = await params;
  const { redirect_url } = await searchParams;

  // Default to /dashboard if no redirect_url is provided
  // Otherwise use the redirect_url from query params (e.g., from share links)
  const redirectTo = redirect_url || "/onboarding";

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-4 md:p-6 overflow-hidden">
      {/* Background with grid and cards */}
      <AuthPageBackground />

      {/* Auth content */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-center mb-6 text-foreground">
          Welcome to ThinkEx
        </h1>
        <div className="w-full flex justify-center">
          <AuthViewWrapper
            path={path}
            redirectTo={redirectTo}
            classNames={{
              base: "bg-background/60 backdrop-blur-md border border-blue-500/20 shadow-xl",
            }}
          />
        </div>
      </div>
    </main>
  );
}



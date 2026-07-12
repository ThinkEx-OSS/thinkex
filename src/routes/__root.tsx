import geistLatinWoff2 from "@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import { WorkspacePersistedStoresHydrator } from "#/features/workspaces/state/persisted-store-hydration";
import type { AuthSession } from "#/lib/auth.functions";
import { AppHotkeysProvider } from "#/lib/hotkeys";
import { seo } from "#/lib/seo";
import { getAuthSessionQueryOptions } from "#/lib/session-query";
import { ThemeProvider, ThemeScript } from "../components/theme-provider";
import PostHogProvider from "../integrations/posthog/provider";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
	session?: AuthSession | null;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: seo.defaultTitle,
			},
		],
		links: [
			{
				rel: "preload",
				href: geistLatinWoff2,
				as: "font",
				type: "font/woff2",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "icon",
				href: import.meta.env.DEV
					? "/favicon-dev.svg"
					: import.meta.env.MODE === "staging"
						? "/favicon-staging.svg"
						: "/favicon.svg",
				type: "image/svg+xml",
				sizes: "any",
			},
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-touch-icon.png",
			},
			{
				rel: "manifest",
				href: "/manifest.json",
			},
		],
	}),
	shellComponent: RootDocument,
});

function AuthSessionRefresher() {
	useQuery(getAuthSessionQueryOptions());
	return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<ThemeScript defaultTheme="system" storageKey="theme" />
				<HeadContent />
			</head>
			<body suppressHydrationWarning>
				<ThemeProvider defaultTheme="system" storageKey="theme">
					<AuthSessionRefresher />
					<PostHogProvider>
						<AppHotkeysProvider>
							<TooltipProvider>
								<WorkspacePersistedStoresHydrator />
								{children}
								<Toaster />
								{import.meta.env.DEV ? (
									<TanStackDevtools
										config={{
											position: "bottom-right",
										}}
										plugins={[
											{
												name: "Tanstack Router",
												render: <TanStackRouterDevtoolsPanel />,
											},
											TanStackQueryDevtools,
										]}
									/>
								) : null}
							</TooltipProvider>
						</AppHotkeysProvider>
					</PostHogProvider>
				</ThemeProvider>
				<Scripts />
			</body>
		</html>
	);
}

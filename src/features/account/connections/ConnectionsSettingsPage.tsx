import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCanGoBack, useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft, CheckIcon, CopyIcon, Plug, Settings } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import AppShell from "#/components/AppShell";
import {
	CodeBlockActions,
	CodeBlockCopyButton,
	CodeBlockHeader,
	CodeBlockLabel,
} from "#/components/code-block/code-block-chrome";
import { AnimatedIconSwap } from "#/components/ui/animated-icon-swap";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import { Field, FieldLabel } from "#/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "#/components/ui/input-group";
import { Skeleton } from "#/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { SettingsNav } from "#/features/account/components/SettingsNav";
import {
	buildMcpServerConfig,
	EDITOR_SETUP_GUIDES,
	getMcpServerUrl,
} from "#/features/account/connections/mcp-setup";
import { formatOAuthScopes } from "#/features/account/connections/oauth-scope-labels";
import {
	deleteOAuthConsent,
	getOAuthClient,
	getOAuthConsents,
} from "#/features/account/connections/oauth-api";
import { useCopyToClipboard } from "#/hooks/use-copy-to-clipboard";
import { getErrorMessage } from "#/lib/error-message";

const oauthConsentsQueryKey = ["oauth-consents"] as const;

function oauthClientQueryKey(clientId: string) {
	return ["oauth-client", clientId] as const;
}

function formatAuthorizedDate(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);

	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

function McpServerUrlField() {
	const mcpServerUrl = getMcpServerUrl();
	const { copied, copy } = useCopyToClipboard({
		onError: () => toast.error("Could not copy MCP server URL"),
	});

	return (
		<Field>
			<FieldLabel htmlFor="mcp-server-url">MCP server URL</FieldLabel>
			<InputGroup>
				<InputGroupInput
					id="mcp-server-url"
					readOnly
					value={mcpServerUrl}
					className="cursor-default bg-muted/40 font-mono text-sm"
				/>
				<InputGroupAddon align="inline-end">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={copied ? "Copied MCP server URL" : "Copy MCP server URL"}
						onClick={() => {
							void copy(mcpServerUrl);
						}}
					>
						<AnimatedIconSwap swapKey={copied}>
							{copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
						</AnimatedIconSwap>
					</Button>
				</InputGroupAddon>
			</InputGroup>
		</Field>
	);
}

function EditorSetupInstructions() {
	const mcpServerUrl = getMcpServerUrl();
	const configJson = useMemo(() => buildMcpServerConfig(mcpServerUrl), [mcpServerUrl]);

	return (
		<section className="space-y-3">
			<div className="space-y-1">
				<h2 className="text-sm font-medium">Connect to your editor</h2>
				<p className="text-sm text-muted-foreground">
					Add ThinkEx as a remote MCP server in your editor. When prompted, sign in and approve
					access.
				</p>
			</div>

			<Tabs defaultValue={EDITOR_SETUP_GUIDES[0]?.id}>
				<TabsList>
					{EDITOR_SETUP_GUIDES.map((guide) => (
						<TabsTrigger key={guide.id} value={guide.id}>
							{guide.label}
						</TabsTrigger>
					))}
				</TabsList>

				{EDITOR_SETUP_GUIDES.map((guide) => (
					<TabsContent key={guide.id} value={guide.id} className="space-y-3 pt-2">
						<p className="text-sm text-muted-foreground">
							Add this configuration to{" "}
							<span className="font-mono text-foreground">{guide.configPath}</span>
							{guide.notes ? `. ${guide.notes}` : "."}
						</p>

						<div className="overflow-hidden rounded-lg border bg-background">
							<CodeBlockHeader>
								<CodeBlockLabel>{guide.label} MCP config</CodeBlockLabel>
								<CodeBlockActions>
									<CodeBlockCopyButton
										code={configJson}
										onError={() => toast.error("Could not copy MCP config")}
									/>
								</CodeBlockActions>
							</CodeBlockHeader>
							<pre className="overflow-x-auto p-4 text-xs leading-relaxed">
								<code>{configJson}</code>
							</pre>
						</div>
					</TabsContent>
				))}
			</Tabs>
		</section>
	);
}

interface AuthorizedConnectionRowProps {
	consentId: string;
	clientId: string;
	clientName: string | undefined;
	scopes: readonly string[];
	authorizedAt: Date | string;
	isRevoking: boolean;
	onRevoke: () => void;
}

function AuthorizedConnectionRow({
	clientName,
	scopes,
	authorizedAt,
	isRevoking,
	onRevoke,
}: AuthorizedConnectionRowProps) {
	const [open, setOpen] = useState(false);
	const scopeLabels = formatOAuthScopes(scopes);

	return (
		<div className="flex items-start justify-between gap-4 rounded-lg border px-4 py-3">
			<div className="min-w-0 space-y-1">
				<p className="truncate text-sm font-medium">{clientName ?? "Unknown application"}</p>
				<p className="text-sm text-muted-foreground">{scopeLabels.join(" · ")}</p>
				<p className="text-xs text-muted-foreground">
					Authorized {formatAuthorizedDate(authorizedAt)}
				</p>
			</div>

			<AlertDialog open={open} onOpenChange={setOpen}>
				<Button variant="outline" size="sm" disabled={isRevoking} onClick={() => setOpen(true)}>
					Revoke
				</Button>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke access?</AlertDialogTitle>
						<AlertDialogDescription>
							{clientName ?? "This application"} will no longer be able to access your ThinkEx
							workspaces. You can reconnect later from your editor.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isRevoking}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={isRevoking}
							onClick={(event) => {
								event.preventDefault();
								onRevoke();
							}}
						>
							Revoke
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function AuthorizedConnectionsSection() {
	const queryClient = useQueryClient();
	const [revokingConsentId, setRevokingConsentId] = useState<string | null>(null);

	const {
		data: consents,
		isLoading,
		isError,
		error,
	} = useQuery({
		queryKey: oauthConsentsQueryKey,
		queryFn: getOAuthConsents,
	});

	const clientQueries = useQueries({
		queries: (consents ?? []).map((consent) => ({
			queryKey: oauthClientQueryKey(consent.clientId),
			queryFn: () => getOAuthClient(consent.clientId),
		})),
	});

	const revokeMutation = useMutation({
		mutationFn: deleteOAuthConsent,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: oauthConsentsQueryKey });
			toast.success("Access revoked");
		},
		onError: (mutationError) => {
			toast.error(getErrorMessage(mutationError, "Unable to revoke access right now."));
		},
		onSettled: () => {
			setRevokingConsentId(null);
		},
	});

	const handleRevoke = (consentId: string) => {
		setRevokingConsentId(consentId);
		revokeMutation.mutate(consentId);
	};

	return (
		<section className="space-y-3 border-t border-border pt-6">
			<div className="space-y-1">
				<h2 className="text-sm font-medium">Authorized applications</h2>
				<p className="text-sm text-muted-foreground">
					Applications that can access your ThinkEx workspaces on your behalf.
				</p>
			</div>

			{isLoading ? (
				<div className="space-y-3">
					<Skeleton className="h-20 w-full rounded-lg" />
					<Skeleton className="h-20 w-full rounded-lg" />
				</div>
			) : null}

			{isError ? (
				<p className="text-sm text-destructive">
					{getErrorMessage(error, "Unable to load authorized applications.")}
				</p>
			) : null}

			{!isLoading && !isError && (consents?.length ?? 0) === 0 ? (
				<Empty className="border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<Plug aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No applications connected yet</EmptyTitle>
						<EmptyDescription>
							When you connect an editor or agent, it will appear here so you can review or revoke
							access.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			) : null}

			{!isLoading && !isError && consents && consents.length > 0 ? (
				<div className="space-y-3">
					{consents.map((consent, index) => {
						const client = clientQueries[index]?.data;

						return (
							<AuthorizedConnectionRow
								key={consent.id}
								consentId={consent.id}
								clientId={consent.clientId}
								clientName={client?.client_name}
								scopes={Array.isArray(consent.scopes) ? consent.scopes : []}
								authorizedAt={consent.createdAt}
								isRevoking={revokingConsentId === consent.id}
								onRevoke={() => handleRevoke(consent.id)}
							/>
						);
					})}
				</div>
			) : null}
		</section>
	);
}

export function ConnectionsSettingsPage() {
	const navigate = useNavigate();
	const router = useRouter();
	const canGoBack = useCanGoBack();

	const handleBack = () => {
		if (canGoBack) {
			router.history.back();
			return;
		}

		void navigate({ to: "/home" });
	};

	return (
		<AppShell
			headerContext={
				<>
					<Settings className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
					<span className="truncate">Settings</span>
				</>
			}
		>
			<div className="mx-auto w-full max-w-lg space-y-8">
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2 w-fit text-muted-foreground"
					onClick={handleBack}
				>
					<ArrowLeft className="size-4" />
					Back
				</Button>

				<SettingsNav />

				<div className="space-y-1">
					<h1 className="text-2xl font-semibold tracking-tight">Connect to editor</h1>
					<p className="text-sm text-muted-foreground">
						Use ThinkEx as a remote MCP server in Cursor, Claude Desktop, VS Code, or Windsurf.
					</p>
				</div>

				<McpServerUrlField />
				<EditorSetupInstructions />
				<AuthorizedConnectionsSection />
			</div>
		</AppShell>
	);
}

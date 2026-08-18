import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
} from "#/components/ui/item";
import { Progress } from "#/components/ui/progress";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { openBillingPortalFn } from "#/features/account/billing-functions";
import { showUpgradeDialog } from "#/features/account/upgrade-navigation";
import {
	BILLING_STATE_QUERY_KEY,
	formatBillingResetDate,
	useBillingState,
} from "#/features/account/use-billing-state";

// Feature IDs are the contract with autumn.config.ts. Labels are ours.
const METERS = [
	{ featureId: "standard_messages", label: "Standard messages" },
	{ featureId: "premium_messages", label: "Premium messages" },
	{ featureId: "file_uploads", label: "File uploads" },
] as const;

export function PlanBillingSection() {
	// An error leaves the state undefined with loading finished, which would read
	// as a confident "Free, nothing included" — the one wrong answer a paying
	// customer must never be shown. Held in the loading state instead: skeletons
	// say "unknown", and the plan row stays absent rather than lying.
	const { balances, isPending, isPro } = useBillingState({ exact: true });

	const resetsOn = formatBillingResetDate(
		METERS.map((meter) => balances?.[meter.featureId]?.next_reset_at).find(
			(value): value is number => typeof value === "number",
		),
	);
	const queryClient = useQueryClient();
	const billingAction = useMutation({
		mutationFn: () => openBillingPortalFn(),
		onSuccess: async ({ url }) => {
			// The server hands back a URL rather than redirecting, so the navigation
			// happens here once Stripe has answered.
			if (url) {
				window.location.href = url;
				return;
			}

			// No URL means Autumn applied the change without a checkout — a card was
			// already on file. The plan really did change, so refetch rather than
			// leave the panel insisting they are still on Free.
			await queryClient.invalidateQueries({ queryKey: BILLING_STATE_QUERY_KEY });
		},
		// Without this the click is simply swallowed, which on a payment button is
		// indistinguishable from the product being broken.
		onError: () => toast.error("Couldn't open billing. Please try again."),
	});

	return (
		// No heading — the active tab already says "Plan & usage".
		<ItemGroup className="gap-0">
			{/* Plan gets its own labelled row rather than a chip beside a button —
			    it's the headline fact of this panel, not an afterthought. */}
			{isPending ? null : (
				<>
					{/* Label, status, action on one row — the action belongs next to the
					    thing it changes, not stranded at the bottom of the panel. */}
					<Item size="sm" className="px-0">
						<ItemContent>
							<ItemTitle className="font-normal text-muted-foreground">Plan</ItemTitle>
						</ItemContent>
						<Badge variant={isPro ? "premium" : "secondary"}>{isPro ? "Pro" : "Free"}</Badge>
						<ItemActions>
							{isPro ? (
								<Button
									variant="outline"
									size="sm"
									disabled={billingAction.isPending}
									onClick={() => {
										billingAction.mutate();
									}}
								>
									{billingAction.isPending ? <Spinner /> : null}
									Manage billing
								</Button>
							) : (
								<Button
									nativeButton={false}
									render={<Link replace search={showUpgradeDialog} to="." />}
									size="sm"
								>
									View plans
								</Button>
							)}
						</ItemActions>
					</Item>
					<ItemSeparator className="my-0" />
				</>
			)}

			{/* No dividers between meters — they're one list of the same thing, and
				    hairlines made three related bars read as three sections. */}
			{METERS.map((meter) =>
				isPending ? (
					<Item key={meter.featureId} size="sm" className="px-0">
						<ItemContent className="gap-2">
							<div className="flex items-center justify-between gap-3">
								<Skeleton className="h-3.5 w-32" />
								<Skeleton className="h-3.5 w-16" />
							</div>
							<Skeleton className="h-1.5 w-full" />
						</ItemContent>
					</Item>
				) : (
					<UsageMeter
						key={meter.featureId}
						balance={balances?.[meter.featureId]}
						label={meter.label}
					/>
				),
			)}

			{/* Every allowance shares one monthly reset, so keep it below the
			    meters rather than repeating the date under each one. */}
			{!isPending && resetsOn ? (
				<>
					<ItemSeparator className="my-0" />
					<Item size="sm" className="px-0">
						<ItemContent>
							<ItemTitle className="font-normal text-muted-foreground">Resets</ItemTitle>
						</ItemContent>
						<span className="text-sm text-foreground">{resetsOn}</span>
					</Item>
				</>
			) : null}
		</ItemGroup>
	);
}

interface UsageMeterProps {
	balance?: { granted?: number | null; remaining?: number | null };
	label: string;
}

function UsageMeter({ balance, label }: UsageMeterProps) {
	// A feature with no balance means the plan doesn't grant it at all. Say so
	// rather than rendering 0 / 0, which reads like something is broken.
	if (!balance) {
		return (
			<Item size="sm" className="px-0">
				<ItemContent>
					<ItemTitle className="font-normal text-muted-foreground">{label}</ItemTitle>
				</ItemContent>
				<span className="text-sm text-muted-foreground">Not included</span>
			</Item>
		);
	}

	const granted = balance.granted ?? 0;
	const remaining = Math.max(0, balance.remaining ?? 0);
	const used = Math.max(0, granted - remaining);

	return (
		<Item size="sm" className="px-0">
			<ItemContent className="gap-2">
				<div className="flex items-center justify-between gap-3">
					<ItemTitle className="font-normal text-muted-foreground">{label}</ItemTitle>
					{/* Bar fills as you spend rather than draining, and the number counts
					    the same direction. A gauge emptying toward zero makes people
					    ration a limit they will almost never reach. */}
					<span className="shrink-0 text-sm tabular-nums text-muted-foreground">
						{used.toLocaleString()} of {granted.toLocaleString()}
					</span>
				</div>
				<Progress value={granted > 0 ? (used / granted) * 100 : 0} className="h-1.5" />
			</ItemContent>
		</Item>
	);
}

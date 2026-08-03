import { useCustomer } from "autumn-js/react";

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

const PRO_PLAN_ID = "pro";

// Feature IDs are the contract with autumn.config.ts. Labels are ours.
const METERS = [
	{ featureId: "standard_messages", label: "Standard messages" },
	{ featureId: "premium_messages", label: "Premium messages" },
	{ featureId: "file_uploads", label: "File uploads" },
] as const;

export function PlanBillingSection() {
	const { data: customer, isLoading, attach, openCustomerPortal } = useCustomer();

	const resetsOn = formatResetDate(
		METERS.map((meter) => customer?.balances?.[meter.featureId]?.nextResetAt).find(
			(value): value is number => typeof value === "number",
		),
	);

	const isPro = Boolean(
		customer?.subscriptions?.some(
			(subscription: { planId?: string | null }) => subscription.planId === PRO_PLAN_ID,
		),
	);

	return (
		// No heading — the active tab already says "Plan & usage".
		<ItemGroup className="gap-0">
			{/* Plan gets its own labelled row rather than a chip beside a button —
			    it's the headline fact of this panel, not an afterthought. */}
			{isLoading ? null : (
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
									onClick={() => {
										void openCustomerPortal();
									}}
								>
									Manage billing
								</Button>
							) : (
								<Button
									size="sm"
									onClick={() => {
										void attach({ planId: PRO_PLAN_ID });
									}}
								>
									Upgrade to Pro
								</Button>
							)}
						</ItemActions>
					</Item>
					<ItemSeparator className="my-0" />

					{/* Every allowance shares one monthly reset, so this is one row rather
					    than the same date repeated under each meter. */}
					{resetsOn ? (
						<>
							<Item size="sm" className="px-0">
								<ItemContent>
									<ItemTitle className="font-normal text-muted-foreground">Resets</ItemTitle>
								</ItemContent>
								<span className="text-sm text-foreground">{resetsOn}</span>
							</Item>
							<ItemSeparator className="my-0" />
						</>
					) : null}
				</>
			)}

			{/* No dividers between meters — they're one list of the same thing, and
				    hairlines made three related bars read as three sections. */}
			{METERS.map((meter) =>
				isLoading ? (
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
						balance={customer?.balances?.[meter.featureId]}
						label={meter.label}
					/>
				),
			)}
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

function formatResetDate(nextResetAt?: number) {
	if (!nextResetAt) {
		return null;
	}

	const date = new Date(nextResetAt);

	return Number.isNaN(date.getTime())
		? null
		: date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

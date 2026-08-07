import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { openBillingPortalFn, startProCheckoutFn } from "#/features/account/billing-functions";
import { PricingPlanCard } from "#/features/account/components/PricingPlanCard";
import { type BillingPeriod, getPricingPlans } from "#/features/account/pricing";
import { BILLING_STATE_QUERY_KEY, useBillingState } from "#/features/account/use-billing-state";
import { UPGRADE_REASON_LABELS, type UpgradeReason } from "#/features/account/upgrade-navigation";
import { capturePostHogClientEvent } from "#/integrations/posthog/provider";

/**
 * billingPeriod is no longer pickable in the UI — it comes from the caller's
 * `billing` search param, so the annual plan stays reachable by link while only
 * monthly is advertised.
 */
export function UpgradeDialog({
	billingPeriod = "monthly",
	onOpenChange,
	open,
	reason,
}: {
	billingPeriod?: BillingPeriod;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	reason?: UpgradeReason;
}) {
	const queryClient = useQueryClient();
	const { isPending, isPro } = useBillingState({ exact: true });
	const currentPlanId = isPro ? "pro" : "free";
	const pricingPlans = getPricingPlans();

	const billingAction = useMutation({
		mutationFn: (run: () => Promise<{ url: string | null }>) => run(),
		onSuccess: async ({ url }) => {
			if (url) {
				window.location.href = url;
				return;
			}

			await queryClient.invalidateQueries({ queryKey: BILLING_STATE_QUERY_KEY });
		},
		onError: () => toast.error("Couldn't open billing. Please try again."),
	});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="ph-no-capture max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-3xl">
				<DialogHeader className="border-b border-border px-5 py-5">
					<DialogTitle>Choose your plan</DialogTitle>
					{/* Named by whoever opened this, not read back off the balances: the
					    question is what the user just ran into, and someone out of two
					    things would otherwise be told about the one they didn't touch.
					    Absent when they browsed here, which needs no explanation. */}
					{reason ? (
						<DialogDescription>
							You&rsquo;re out of {UPGRADE_REASON_LABELS[reason]} this month.
						</DialogDescription>
					) : null}
				</DialogHeader>
				<div className="grid gap-5 p-5 sm:grid-cols-2">
					{pricingPlans.map((plan) => {
						const current = !isPending && plan.id === currentPlanId;
						let action: ReactNode;

						if (isPending) {
							action = (
								<Button className="w-full" disabled variant="outline">
									<Spinner />
									Loading plan
								</Button>
							);
						} else if (plan.id === "free" && current) {
							action = (
								<Button className="w-full" disabled variant="outline">
									Current plan
								</Button>
							);
						} else if (plan.id === "pro") {
							action = (
								<Button
									className="w-full"
									disabled={billingAction.isPending}
									variant={current ? "outline" : "default"}
									onClick={() => {
										// Only the new-subscription path: the portal is an existing
										// customer managing billing, which is not a conversion.
										if (!current) {
											capturePostHogClientEvent("upgrade_checkout_started", {
												billing_period: billingPeriod,
												reason: reason ?? null,
											});
										}

										billingAction.mutate(() =>
											current
												? openBillingPortalFn()
												: startProCheckoutFn({
														data: { billingPeriod },
													}),
										);
									}}
								>
									{billingAction.isPending ? <Spinner /> : null}
									{current ? "Manage billing" : "Upgrade to Pro"}
								</Button>
							);
						}

						return <PricingPlanCard key={plan.id} action={action} plan={plan} />;
					})}
				</div>
			</DialogContent>
		</Dialog>
	);
}

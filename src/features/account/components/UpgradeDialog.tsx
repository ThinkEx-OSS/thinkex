import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Button } from "#/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#/components/ui/dialog";
import { Spinner } from "#/components/ui/spinner";
import { openBillingPortalFn, startProCheckoutFn } from "#/features/account/billing-functions";
import { BillingPeriodSelector } from "#/features/account/components/BillingPeriodSelector";
import { PricingPlanCard } from "#/features/account/components/PricingPlanCard";
import { type BillingPeriod, getPricingPlans } from "#/features/account/pricing";
import { BILLING_STATE_QUERY_KEY, useBillingState } from "#/features/account/use-billing-state";

export function UpgradeDialog({
	deal,
	initialBillingPeriod = "annual",
	onOpenChange,
	open,
}: {
	deal?: "yc";
	initialBillingPeriod?: BillingPeriod;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>(initialBillingPeriod);
	const queryClient = useQueryClient();
	const { isPending, isPro } = useBillingState({ exact: true });
	const currentPlanId = isPro ? "pro" : "free";
	const pricingPlans = getPricingPlans(billingPeriod);

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
				</DialogHeader>
				<div className="flex flex-col items-center gap-2 px-5 pt-5">
					<BillingPeriodSelector
						disabled={deal === "yc"}
						onChange={setBillingPeriod}
						value={billingPeriod}
					/>
					{deal === "yc" ? (
						<p className="text-xs text-muted-foreground">
							YC deal: first year free, then $84 yearly unless cancelled.
						</p>
					) : null}
				</div>

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
										billingAction.mutate(() =>
											current
												? openBillingPortalFn()
												: startProCheckoutFn({
														data: { billingPeriod, deal },
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

import { useCustomer } from "autumn-js/react";

export const PRO_PLAN_ID = "pro";

/**
 * Whether Pro is active right now. Lives on its own because three surfaces need
 * it — the plan panel, the model picker, the composer notice — and every one of
 * them uses it to decide whether an upgrade prompt is honest. A prompt shown to
 * someone who already pays reads as the product not knowing who they are.
 *
 * False while loading, so an upgrade CTA can never flash at a subscriber.
 * `subscriptions` also carries scheduled plans, and the status enum is open, so
 * only an explicitly active Pro counts.
 */
export function useIsProPlan() {
	const { data: customer } = useCustomer();

	return Boolean(
		customer?.subscriptions?.some(
			(subscription) => subscription.planId === PRO_PLAN_ID && subscription.status === "active",
		),
	);
}

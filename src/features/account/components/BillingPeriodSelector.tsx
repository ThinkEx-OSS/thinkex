import { Button } from "#/components/ui/button";
import type { BillingPeriod } from "#/features/account/pricing";

export function BillingPeriodSelector({
	disabled = false,
	onChange,
	value,
}: {
	disabled?: boolean;
	onChange: (value: BillingPeriod) => void;
	value: BillingPeriod;
}) {
	return (
		<div
			className="inline-flex rounded-md border border-border bg-muted/40 p-1"
			aria-label="Billing period"
		>
			<Button
				aria-pressed={value === "monthly"}
				disabled={disabled}
				onClick={() => onChange("monthly")}
				size="sm"
				variant={value === "monthly" ? "secondary" : "ghost"}
			>
				Monthly
			</Button>
			<Button
				aria-pressed={value === "annual"}
				disabled={disabled}
				onClick={() => onChange("annual")}
				size="sm"
				variant={value === "annual" ? "secondary" : "ghost"}
			>
				Annual · Save 13%
			</Button>
		</div>
	);
}

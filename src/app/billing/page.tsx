"use client";

import { useCustomer, useListPlans } from "autumn-js/react";
import { useState } from "react";
import { Loader2, CreditCard, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

type PremiumBalance = {
  balance?: number;
  limit?: number;
  unlimited?: boolean;
  remaining?: number;
  granted?: number;
};

type CustomerSubscription = {
  status?: string;
  productId?: string;
  planId?: string;
  plan?: {
    name?: string;
  };
};

type Customer = {
  features?: {
    premium_message?: PremiumBalance;
  };
  balances?: {
    premium_message?: PremiumBalance;
  };
  subscriptions?: CustomerSubscription[];
};

type PlanPrice = {
  amount?: number;
  interval?: string;
  recurring?: {
    interval?: string;
  };
};

type Plan = {
  id: string;
  name?: string;
  description?: string;
  price?: PlanPrice | number | null;
  prices?: PlanPrice[];
  customerEligibility?: {
    attachAction?: "activate" | "upgrade" | "downgrade" | "purchase" | "none";
    status?: "active" | "scheduled" | string;
    trialAvailable?: boolean;
  };
};

type UseCustomerApi = ReturnType<typeof useCustomer>;

function getAutumnCustomer(api: UseCustomerApi): Customer | null {
  const customerApi = api as unknown as {
    customer?: Customer | null;
    data?: Customer | null;
  };
  return customerApi.customer ?? customerApi.data ?? null;
}

function getPremiumBalance(customer?: Customer | null) {
  const premiumBalance =
    customer?.features?.premium_message ?? customer?.balances?.premium_message;

  if (!premiumBalance) return null;

  return {
    balance: premiumBalance.balance ?? premiumBalance.remaining ?? 0,
    limit: premiumBalance.limit ?? premiumBalance.granted ?? 0,
    unlimited: premiumBalance.unlimited ?? false,
  };
}

async function attachPlan(api: UseCustomerApi, planId: string) {
  const customerApi = api as unknown as {
    attach?: (params: Record<string, unknown>) => Promise<unknown>;
  };

  if (!customerApi.attach) {
    throw new Error("Attach is not available");
  }

  try {
    return await customerApi.attach({ productId: planId });
  } catch (error) {
    return await customerApi.attach({ planId });
  }
}

async function cancelPlan(api: UseCustomerApi, planId: string) {
  const customerApi = api as unknown as {
    cancel?: (params: Record<string, unknown>) => Promise<unknown>;
    updateSubscription?: (params: Record<string, unknown>) => Promise<unknown>;
  };

  if (customerApi.cancel) {
    return customerApi.cancel({ productId: planId });
  }

  if (customerApi.updateSubscription) {
    return customerApi.updateSubscription({
      planId,
      cancelAction: "cancel_end_of_cycle",
    });
  }

  throw new Error("Cancellation is not available");
}

async function openBillingPortal(api: UseCustomerApi, returnUrl: string) {
  const customerApi = api as unknown as {
    openBillingPortal?: (params: Record<string, unknown>) => Promise<unknown>;
    openCustomerPortal?: (params: Record<string, unknown>) => Promise<unknown>;
  };

  if (customerApi.openBillingPortal) {
    return customerApi.openBillingPortal({ returnUrl });
  }

  if (customerApi.openCustomerPortal) {
    return customerApi.openCustomerPortal({ returnUrl });
  }

  throw new Error("Billing portal is not available");
}

function BillingSectionSkeleton() {
  return (
    <div className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-60" />
      <Skeleton className="h-10 w-36" />
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-4 w-48" />
    </div>
  );
}

function getPlanLabel(plan: Plan) {
  const eligibility = plan.customerEligibility;

  if (eligibility?.attachAction === "none") {
    return eligibility.status === "scheduled" ? "Scheduled" : "Current Plan";
  }

  switch (eligibility?.attachAction) {
    case "upgrade":
      return "Upgrade";
    case "downgrade":
      return "Downgrade";
    case "purchase":
      return "Purchase";
    case "activate":
      return "Subscribe";
    default:
      return plan.price ? "Choose Plan" : "Get Started";
  }
}

function getPlanPrice(plan: Plan) {
  const priceCandidate =
    Array.isArray(plan.prices) && plan.prices.length > 0
      ? plan.prices[0]
      : plan.price;

  if (priceCandidate == null) {
    return { amount: null as number | null, interval: "month" };
  }

  if (typeof priceCandidate === "number") {
    return { amount: priceCandidate, interval: "month" };
  }

  return {
    amount:
      typeof priceCandidate.amount === "number" ? priceCandidate.amount : null,
    interval:
      priceCandidate.interval || priceCandidate.recurring?.interval || "month",
  };
}

function formatPlanPrice(plan: Plan) {
  const { amount, interval } = getPlanPrice(plan);

  if (amount == null || amount <= 0) {
    return "Free";
  }

  const normalizedAmount = amount / 100;
  return `$${normalizedAmount.toFixed(normalizedAmount % 1 === 0 ? 0 : 2)}/${interval === "year" ? "yr" : "mo"}`;
}

function UsageSection() {
  const customerApi = useCustomer();
  const customer = getAutumnCustomer(customerApi);
  const isLoading = customerApi.isLoading;

  if (isLoading) {
    return <BillingSectionSkeleton />;
  }

  const premiumBalance = getPremiumBalance(customer);
  const remaining = premiumBalance?.balance ?? 0;
  const limit = premiumBalance?.limit ?? 0;
  const used = limit > 0 ? Math.max(0, limit - remaining) : 0;
  const progress = limit > 0 ? (used / limit) * 100 : 0;
  const activeSubscription = customer?.subscriptions?.find(
    (subscription) => subscription.status === "active",
  );
  const currentPlan =
    activeSubscription?.plan?.name ||
    activeSubscription?.productId ||
    activeSubscription?.planId ||
    (premiumBalance?.unlimited ? "Pro" : "Free");

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Your Plan</h2>
          <p className="text-sm text-muted-foreground">
            Track your premium AI usage and current subscription status.
          </p>
        </div>
        <Badge variant={premiumBalance?.unlimited ? "default" : "secondary"}>
          {currentPlan}
        </Badge>
      </div>

      {premiumBalance ? (
        premiumBalance.unlimited ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Sparkles className="h-4 w-4 text-emerald-500" />
              Unlimited premium messages
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              You have unlimited access to premium chat models on your current
              plan.
            </p>
          </div>
        ) : (
          <div className="space-y-3 rounded-xl border bg-muted/20 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Premium messages</p>
                <p className="text-sm text-muted-foreground">
                  {remaining} remaining out of {limit} this month
                </p>
              </div>
              <div className="text-sm font-medium text-foreground">
                {limit > 0
                  ? `${Math.round((remaining / limit) * 100)}% left`
                  : "0% left"}
              </div>
            </div>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              Only premium models consume credits. Basic models remain
              unlimited.
            </p>
          </div>
        )
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          Usage data will appear here once your billing profile is loaded.
        </div>
      )}
    </section>
  );
}

function PricingTable() {
  const {
    data: plans,
    isLoading,
    error,
  } = useListPlans() as {
    data?: Plan[];
    isLoading?: boolean;
    error?: Error | null;
  };
  const customerApi = useCustomer();
  const [submittingPlanId, setSubmittingPlanId] = useState<string | null>(null);

  const handleAttach = async (planId: string) => {
    setSubmittingPlanId(planId);
    try {
      await attachPlan(customerApi, planId);
    } catch (error) {
      console.error("Failed to attach plan", error);
      toast.error("Unable to start checkout", {
        description: "Please try again in a moment.",
      });
    } finally {
      setSubmittingPlanId(null);
    }
  };

  if (isLoading) {
    return (
      <section className="space-y-4">
        <div className="space-y-1 text-center">
          <h2 className="text-xl font-semibold">Plans</h2>
          <p className="text-sm text-muted-foreground">
            Choose the plan that matches your usage.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <BillingSectionSkeleton />
          <BillingSectionSkeleton />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border bg-card p-6 text-center shadow-sm">
        <h2 className="text-xl font-semibold">Plans</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          We couldn&apos;t load pricing right now. Please refresh and try again.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-semibold">Plans</h2>
        <p className="text-sm text-muted-foreground">
          Upgrade for unlimited premium messages, or stay on the free tier.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {plans?.map((plan) => {
          const disabled = plan.customerEligibility?.attachAction === "none";
          const isCurrent = plan.customerEligibility?.status === "active";
          const isProcessing = submittingPlanId === plan.id;

          return (
            <article
              key={plan.id}
              className="flex h-full flex-col rounded-2xl border bg-card p-6 shadow-sm"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">
                      {plan.name || plan.id}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {plan.description ||
                        (plan.id === "pro"
                          ? "Unlimited premium messages and unrestricted access to all models."
                          : "100 premium AI messages per month with unlimited basic models.")}
                    </p>
                  </div>
                  {isCurrent ? <Badge>Active</Badge> : null}
                </div>
                <div className="text-3xl font-bold tracking-tight">
                  {formatPlanPrice(plan)}
                </div>
                {plan.customerEligibility?.trialAvailable ? (
                  <p className="text-xs font-medium text-emerald-500">
                    Trial available
                  </p>
                ) : null}
              </div>

              <div className="mt-6 space-y-3 text-sm text-muted-foreground">
                {plan.id === "pro" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" />
                      Unlimited premium messages
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Unlimited access to all chat models
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-amber-500" />
                      100 premium AI messages each month
                    </div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Unlimited basic models
                    </div>
                  </>
                )}
              </div>

              <div className="mt-6">
                <Button
                  className="w-full"
                  disabled={disabled || isProcessing}
                  onClick={() => handleAttach(plan.id)}
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    getPlanLabel(plan)
                  )}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SubscriptionManagement() {
  const customerApi = useCustomer();
  const customer = getAutumnCustomer(customerApi);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);

  const premiumBalance = getPremiumBalance(customer);
  const subscriptions = customer?.subscriptions || [];
  const hasActivePaidPlan =
    premiumBalance?.unlimited ||
    subscriptions.some(
      (subscription) =>
        subscription.status === "active" &&
        (subscription.productId === "pro" || subscription.planId === "pro"),
    );

  const handleCancel = async () => {
    setIsCancelling(true);
    try {
      await cancelPlan(customerApi, "pro");
      toast.success("Plan cancellation requested", {
        description:
          "Your Pro plan will remain active until the current billing period ends.",
      });
    } catch (error) {
      console.error("Failed to cancel plan", error);
      toast.error("Unable to cancel plan", {
        description: "Please try again from the billing portal.",
      });
    } finally {
      setIsCancelling(false);
    }
  };

  const handleOpenPortal = async () => {
    setIsPortalLoading(true);
    try {
      await openBillingPortal(customerApi, window.location.href);
    } catch (error) {
      console.error("Failed to open billing portal", error);
      toast.error("Unable to open billing portal", {
        description: "Please try again in a moment.",
      });
    } finally {
      setIsPortalLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Subscription Management</h2>
        <p className="text-sm text-muted-foreground">
          Manage your subscription, payment method, and billing history.
        </p>
      </div>

      <Separator className="my-6" />

      {hasActivePaidPlan ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Cancelling...
              </>
            ) : (
              "Cancel Plan"
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={handleOpenPortal}
            disabled={isPortalLoading}
          >
            {isPortalLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Opening portal...
              </>
            ) : (
              <>
                <CreditCard className="mr-2 h-4 w-4" />
                Manage Payment Method
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          You&apos;re currently on the free plan. Upgrade to Pro to manage
          billing in Stripe.
        </div>
      )}
    </section>
  );
}

export default function BillingPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-12 px-4 py-12 md:px-6">
      <section className="space-y-3 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          Plans &amp; Billing
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Manage your subscription, track premium message usage, and update
          billing details.
        </p>
      </section>

      <UsageSection />
      <PricingTable />
      <SubscriptionManagement />
    </main>
  );
}

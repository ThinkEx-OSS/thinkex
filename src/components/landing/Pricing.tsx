"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  cta: string;
  ctaLink: string;
  highlighted?: boolean;
  badge?: string;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Everything you need to get started",
    features: [
      "Unlimited workspaces",
      "Import PDFs, URLs, and videos",
      "AI chat with context control",
      "Collaborative sharing",
    ],
    cta: "Get Started",
    ctaLink: "/guest-setup",
  },
  {
    name: "Pro",
    price: "$9",
    period: "month",
    description: "Power features for everyone",
    features: [
      "Everything in Free",
      "Extended AI usage limits",
      "Priority support",
      "Early access to new features",
    ],
    cta: "Start Free",
    ctaLink: "/guest-setup",
    highlighted: true,
  },
];

export function Pricing() {
  const borderColor = getCardAccentColor("#10B981" as CardColor, 0.2); // Green border

  return (
    <section id="pricing" className="pt-8 md:pt-20 pb-4 md:pb-16 px-4 sm:px-4 lg:px-6">
      <div
        className="mx-auto max-w-6xl relative bg-gray-900/40 dark:bg-gray-900/40 rounded-md p-6 md:p-10"
        style={{
          border: `2px solid ${borderColor}`,
        }}
      >
        <div className="relative">
          <div className="mb-8 md:mb-12">
            <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
              Free While We Grow
            </h2>
            <p className="mt-4 text-lg md:text-xl text-muted-foreground">
              All we ask in return is your feedback.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-md border p-8 ${tier.highlighted
                  ? "border-foreground/30 bg-foreground/5 shadow-lg"
                  : "border-foreground/10 bg-background"
                  }`}
              >
                {tier.badge && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-4 py-1 text-sm font-medium">
                      {tier.badge}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-medium text-foreground mb-2">
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline gap-2 mb-2">
                    {tier.highlighted ? (
                      <>
                        <span className="text-4xl font-medium text-foreground line-through opacity-50">
                          {tier.price}
                        </span>
                        <span className="text-4xl font-medium text-foreground">
                          Free
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="text-4xl font-medium text-foreground">
                          {tier.price}
                        </span>
                        {tier.period && (
                          <span className="text-muted-foreground">/{tier.period}</span>
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {tier.description}
                  </p>
                </div>

                <ul className="space-y-3 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-foreground/90">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  asChild
                  className={`w-full ${tier.highlighted
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "border-foreground/20 hover:bg-foreground/5"
                    }`}
                  variant={tier.highlighted ? "default" : "outline"}
                  size="lg"
                >
                  <Link href={tier.ctaLink} className="block" prefetch>
                    {tier.cta}
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

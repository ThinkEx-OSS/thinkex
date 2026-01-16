"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface Feature {
  name: string;
  included: boolean;
}

interface PricingTier {
  name: string;
  price: string;
  period: string;
  description: string;
  features: Feature[];
  cta: string;
  ctaLink: string;
  highlighted?: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Perfect for getting started",
    features: [
      { name: "Up to 3 workspaces", included: true },


      { name: "Limited AI use", included: true },
      { name: "Unlimited workspaces", included: false },
      { name: "Advanced AI features", included: false },
    ],
    cta: "Get Started",
    ctaLink: "/guest-setup",
  },
  {
    name: "Pro",
    price: "$9",
    period: "per month",
    description: "For power users and teams",
    features: [
      { name: "Unlimited workspaces", included: true },
      { name: "Advanced AI features", included: true },
      { name: "Extended AI use", included: true },


      { name: "Everything else", included: true },
    ],
    cta: "Start Free",
    ctaLink: "/guest-setup",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large organizations",
    features: [

      { name: "Custom integrations", included: true },
      { name: "Dedicated support", included: true },
      { name: "Advanced security", included: true },
      { name: "SLA guarantee", included: true },

    ],
    cta: "Contact Sales",
    ctaLink: "/contact",
  },
];

export function Pricing() {
  const borderColor = getCardAccentColor("#10B981" as CardColor, 0.2); // Green border

  return (
    <section id="pricing" className="pt-8 md:pt-32 pb-4 md:pb-16 px-4 sm:px-4 lg:px-6">
      <div className="mx-auto max-w-6xl relative">
        <div
          className="absolute -top-8 -right-2 -bottom-8 -left-2 md:-top-12 md:-right-6 md:-bottom-12 md:-left-6 bg-gray-900/40 dark:bg-gray-900/40 rounded-md"
          style={{
            border: `2px solid ${borderColor}`,
          }}
        ></div>
        <div className="relative p-4 md:p-6">
          <div className="mb-8 md:mb-20">
            <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
              Simple, transparent pricing
            </h2>
          </div>

          <div className="grid gap-8 md:grid-cols-3">
            {pricingTiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-md border p-8 ${tier.highlighted
                  ? "border-foreground/30 bg-foreground/5 shadow-lg"
                  : "border-foreground/10 bg-background"
                  }`}
              >
                {tier.highlighted && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-foreground px-4 py-1 text-sm font-medium text-background">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-2xl font-medium text-foreground mb-2">
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline gap-2 mb-2">
                    {tier.name === "Pro" ? (
                      <>
                        <span className="text-4xl font-medium text-foreground line-through opacity-50">
                          {tier.price}
                        </span>
                        <span className="text-4xl font-medium text-foreground">
                          Free
                        </span>
                        <span className="text-sm font-medium text-foreground bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 px-2 py-1 rounded self-center">
                          in beta
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

                <ul className="space-y-4 mb-8">
                  {tier.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      {feature.included ? (
                        <Check className="h-5 w-5 text-foreground flex-shrink-0 mt-0.5" />
                      ) : (
                        <X className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                      )}
                      <span className={`text-sm ${feature.included ? "text-foreground/90" : "text-muted-foreground"}`}>
                        {feature.name}
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

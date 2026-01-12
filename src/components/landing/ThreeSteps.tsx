"use client";

import { motion } from "motion/react";
import Image from "next/image";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface Step {
  id: string;
  number: number;
  title: string;
  description: string;
  image: string;
}

const steps: Step[] = [
  {
    id: "step-1",
    number: 1,
    title: "Rich Block-Based Editor",
    description:
      "Create and edit content with a powerful block-based editor. Math is a first-class citizen with seamless equation and formula support.",
    image: "/editor2.png",
  },
  {
    id: "step-2",
    number: 2,
    title: "Powerful Content Types",
    description:
      "Create folders, embed YouTube videos, build flashcards, use deep research, and more—all in one workspace.",
    image: "/contenttypes.png",
  },
  {
    id: "step-3",
    number: 3,
    title: "Share Workspaces",
    description:
      "Share your workspaces with friends. Work together on notes and assignments, exchange ideas, and build knowledge as a group.",
    image: "/share2.png",
  },
];

export function ThreeSteps() {
  const borderColor = getCardAccentColor("#8B5CF6" as CardColor, 0.2); // Purple border

  return (
    <section id="three-steps" className="py-16 md:py-32 px-4 sm:px-4 lg:px-6">
      <div className="mx-auto max-w-6xl relative">
        <div
          className="absolute -top-8 -right-2 -bottom-8 -left-2 md:-top-12 md:-right-6 md:-bottom-12 md:-left-6 bg-gray-900/40 dark:bg-gray-900/40 rounded-md"
          style={{
            border: `2px solid ${borderColor}`,
          }}
        ></div>
        <div className="relative p-4 md:p-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-8 md:mb-20"
          >
            <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
              More features, more power
            </h2>
          </motion.div>

          <div className="grid gap-8 md:gap-12 md:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="space-y-6"
              >
                {/* Image */}
                <div className="relative">
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border border-foreground/10 bg-muted/30 backdrop-blur-sm">
                    <Image
                      src={step.image}
                      alt={step.title}
                      fill
                      className="object-cover"
                      style={step.id === "step-2" ? { objectPosition: "left center" } : undefined}
                      unoptimized
                    />
                  </div>
                </div>

                {/* Step Content */}
                <div className="space-y-3">
                  <h3 className="text-2xl font-medium tracking-tight text-foreground">
                    {step.title}
                  </h3>
                  <p className="text-lg leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

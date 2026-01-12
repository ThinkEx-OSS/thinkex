"use client";

import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface Feature {
  name: string;
  thinkex: boolean | string;
  competitor1: boolean | string;
  competitor2: boolean | string;
}

const features: Feature[] = [
  {
    name: "Block-Based Editor with Math Support",
    thinkex: true,
    competitor1: false,
    competitor2: false,
  },
  {
    name: "AI Message Extractions",
    thinkex: true,
    competitor1: false,
    competitor2: false,
  },
  {
    name: "Visual Canvas with Drag & Drop",
    thinkex: true,
    competitor1: "Basic",
    competitor2: "Basic",
  },
  {
    name: "PDF & URL Import",
    thinkex: true,
    competitor1: true,
    competitor2: false,
  },

  {
    name: "Workspace Sharing",
    thinkex: true,
    competitor1: true,
    competitor2: true,
  },
];

const competitors = [
  { name: "ThinkEx", isHighlight: true },
  { name: "Notion", isHighlight: false },
  { name: "Obsidian", isHighlight: false },
];

export function Comparison() {
  const borderColor = getCardAccentColor("#3B82F6" as CardColor, 0.2); // Blue border

  return (
    <section id="comparison" className="py-16 md:py-32 px-4 sm:px-4 lg:px-6">
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
              How we compare
            </h2>
          </motion.div>

          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="min-w-full inline-block">
              <table className="w-full border-collapse text-sm md:text-base">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left py-3 px-2 md:py-4 md:px-4 text-xs md:text-sm font-medium text-foreground/70">
                      Feature
                    </th>
                    {competitors.map((competitor) => (
                      <th
                        key={competitor.name}
                        className={`text-center py-3 px-2 md:py-4 md:px-6 text-xs md:text-sm font-medium ${competitor.isHighlight
                            ? "text-foreground"
                            : "text-foreground/70"
                          }`}
                      >
                        {competitor.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {features.map((feature, index) => (
                    <tr
                      key={feature.name}
                      className="border-b border-foreground/5 hover:bg-foreground/5 transition-colors"
                    >
                      <td className="py-3 px-2 md:py-4 md:px-4 text-xs md:text-sm text-foreground/90">
                        {feature.name}
                      </td>
                      <td className="py-3 px-2 md:py-4 md:px-6 text-center">
                        {typeof feature.thinkex === "boolean" ? (
                          feature.thinkex ? (
                            <Check className="h-4 w-4 md:h-5 md:w-5 text-foreground mx-auto" />
                          ) : (
                            <X className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-xs md:text-sm text-muted-foreground">
                            {feature.thinkex}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 md:py-4 md:px-6 text-center">
                        {typeof feature.competitor1 === "boolean" ? (
                          feature.competitor1 ? (
                            <Check className="h-4 w-4 md:h-5 md:w-5 text-foreground mx-auto" />
                          ) : (
                            <X className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-xs md:text-sm text-muted-foreground">
                            {feature.competitor1}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-2 md:py-4 md:px-6 text-center">
                        {typeof feature.competitor2 === "boolean" ? (
                          feature.competitor2 ? (
                            <Check className="h-4 w-4 md:h-5 md:w-5 text-foreground mx-auto" />
                          ) : (
                            <X className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-xs md:text-sm text-muted-foreground">
                            {feature.competitor2}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


"use client";

import { Check, X } from "lucide-react";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface Feature {
  name: string;
  thinkex: boolean | string;
  competitor1: boolean | string;
  competitor2: boolean | string;
  competitor3: boolean | string;
}

const features: Feature[] = [
  {
    name: "Sources visible while you work",
    thinkex: true,
    competitor1: false,
    competitor2: "Limited",
    competitor3: false,
  },
  {
    name: "Extract & save AI insights",
    thinkex: true,
    competitor1: "Basic",
    competitor2: false,
    competitor3: false,
  },
  {
    name: "Choose what context AI sees",
    thinkex: true,
    competitor1: "Limited",
    competitor2: false,
    competitor3: false,
  },
  {
    name: "Visual workspace",
    thinkex: true,
    competitor1: "Mind maps",
    competitor2: "Basic",
    competitor3: false,
  },
  {
    name: "Dynamic notes & sources",
    thinkex: true,
    competitor1: false,
    competitor2: "Limited",
    competitor3: false,
  },
  {
    name: "Open source",
    thinkex: true,
    competitor1: false,
    competitor2: false,
    competitor3: false,
  },
];

const competitors = [
  { name: "ThinkEx", isHighlight: true },
  { name: "NotebookLM", isHighlight: false },
  { name: "Notion", isHighlight: false },
  { name: "ChatGPT/Gemini", isHighlight: false },
];

export function Comparison() {
  const borderColor = getCardAccentColor("#3B82F6" as CardColor, 0.2); // Blue border

  return (
    <section id="comparison" className="py-16 md:py-20 px-4 sm:px-4 lg:px-6">
      <div
        className="mx-auto max-w-6xl relative bg-gray-900/40 dark:bg-gray-900/40 rounded-md p-6 md:p-10"
        style={{
          border: `2px solid ${borderColor}`,
        }}
      >
        <div className="relative">
          <div className="mb-8 md:mb-20">
            <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
              More Than Just Features
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
              A fundamentally different approach to working with AI.
            </p>
          </div>

          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="min-w-full inline-block">
              <table className="w-full border-collapse text-sm md:text-base">
                <thead>
                  <tr className="border-b border-foreground/10">
                    <th className="text-left py-3 px-2 md:py-4 md:px-4 text-xs md:text-sm font-medium text-foreground/70">
                      Capabilities
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
                  {features.map((feature) => (
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
                      <td className="py-3 px-2 md:py-4 md:px-6 text-center">
                        {typeof feature.competitor3 === "boolean" ? (
                          feature.competitor3 ? (
                            <Check className="h-4 w-4 md:h-5 md:w-5 text-foreground mx-auto" />
                          ) : (
                            <X className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground mx-auto" />
                          )
                        ) : (
                          <span className="text-xs md:text-sm text-muted-foreground">
                            {feature.competitor3}
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

"use client";

import Image from "next/image";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

interface Way {
  id: string;
  title: string;
  bullets: string[];
  imageSide: "left" | "right";
  image: string;
}

const ways: Way[] = [
  {
    id: "way-1",
    title: "Your sources stay visible",
    bullets: [
      "Import PDFs, URLs, videos, and documents",
      "Everything remains in view — no hidden black boxes",
      "Work alongside your sources, not blind to them",
    ],
    imageSide: "right",
    image: "/sources.png",
  },
  {
    id: "way-2",
    title: "Capture what matters",
    bullets: [
      "Highlight any AI response to extract it",
      "Turn conversations into structured notes",
      "Nothing gets buried in endless scroll",
    ],
    imageSide: "right",
    image: "/highlight.png",
  },
  {
    id: "way-3",
    title: "You control what AI sees",
    bullets: [
      "Select exactly which notes and documents to include",
      "No guessing — you see what the AI sees",
      "Get grounded, relevant responses every time",
    ],
    imageSide: "right",
    image: "/context.png",
  },
  {
    id: "way-4",
    title: "Knowledge that compounds",
    bullets: [
      "Your notes update the AI's understanding in real-time",
      "Build on past thinking instead of starting over",
      "Organize everything on a flexible visual canvas",
    ],
    imageSide: "right",
    image: "/structure.png",
  },
];

export function FourWays() {
  const borderColor = getCardAccentColor("#EC4899" as CardColor, 0.2); // Pink border

  return (
    <section id="four-ways" className="py-16 md:py-20 px-4 sm:px-4 lg:px-6">
      <div
        className="mx-auto max-w-6xl relative bg-gray-900/40 dark:bg-gray-900/40 rounded-md p-6 md:p-10"
        style={{
          border: `2px solid ${borderColor}`,
        }}
      >
        <div className="relative">
          {/* Section Header */}
          <div className="mb-8 md:mb-12">
            <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
              A Better Way to Work
            </h2>
          </div>

          {/* Four Ways Grid */}
          <div className="flex flex-col gap-10 md:gap-16">
            {ways.map((way, index) => (
              <div
                key={way.id}
                className="relative"
              >
                <div
                  className={`grid gap-6 md:gap-12 items-center md:grid-cols-2 ${way.imageSide === "left" ? "md:grid-flow-dense" : ""
                    }`}
                >
                  {/* Text Content */}
                  <div
                    className={`space-y-4 md:space-y-6 ${way.imageSide === "left" ? "md:col-start-2" : ""
                      }`}
                  >
                    <h3 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
                      {way.title}
                    </h3>
                    <ul className="space-y-2 text-base md:text-lg leading-relaxed text-muted-foreground list-disc list-inside pl-1">
                      {way.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex}>{bullet}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Screenshot */}
                  <div
                    className={`relative flex items-center justify-center ${way.imageSide === "left" ? "md:col-start-1 md:row-start-1" : ""
                      }`}
                  >
                    {/* Mobile: Fixed aspect ratio with object-cover */}
                    <div className="relative w-full aspect-[4/3] h-[180px] overflow-hidden rounded-md border border-foreground/10 bg-muted/30 backdrop-blur-sm md:hidden">
                      <Image
                        src={way.image}
                        alt={way.title}
                        fill
                        loading="lazy"
                        sizes="100vw"
                        className="object-cover"
                        style={
                          way.image === "/sources.png"
                            ? { objectPosition: "left center" }
                            : way.image === "/highlight.png"
                              ? { objectPosition: "center 60%" }
                              : way.image === "/structure.png"
                                ? { objectPosition: "center top" }
                                : undefined
                        }
                      />
                    </div>
                    {/* Desktop: Fixed size container */}
                    <div className="hidden md:flex relative w-full h-[320px] overflow-hidden rounded-md border border-foreground/10 bg-muted/30 backdrop-blur-sm items-center justify-center">
                      <Image
                        src={way.image}
                        alt={way.title}
                        width={800}
                        height={600}
                        loading="lazy"
                        sizes="50vw"
                        className="w-full h-full object-cover"
                        style={
                          way.image === "/sources.png"
                            ? { objectPosition: "left center" }
                            : way.image === "/highlight.png"
                              ? { objectPosition: "center 60%" }
                              : way.image === "/structure.png"
                                ? { objectPosition: "center top" }
                                : undefined
                        }
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

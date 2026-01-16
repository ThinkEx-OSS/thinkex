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
    title: "Build Your Context",
    bullets: [
      "Import PDFs, URLs, and documents",
      "Create a rich knowledge base",
      "Give AI the context it needs to help you",
    ],
    imageSide: "right",
    image: "/attachments.png",
  },
  {
    id: "way-2",
    title: "Highlight & Annotate",
    bullets: [
      "Select any AI response to get instant actions",
      "Highlight multiple selections and create notes",
      "Reply to multiple messages at once",
    ],
    imageSide: "right",
    image: "/highlight.png",
  },
  {
    id: "way-3",
    title: "Control Your Context",
    bullets: [
      "Select what context to use in chat",
      "Bring in notes or documents as needed",
      "Work with the right information",
    ],
    imageSide: "right",
    image: "/context.png",
  },
  {
    id: "way-4",
    title: "Structure Your Knowledge",
    bullets: [
      "Turn AI insights into valuable resources",
      "Organize concepts in a visual canvas",
      "Adapt it to your preferences",
    ],
    imageSide: "right",
    image: "/structure.png",
  },
];

export function FourWays() {
  const borderColor = getCardAccentColor("#EC4899" as CardColor, 0.2); // Pink border

  return (
    <section id="four-ways" className="py-16 md:py-32 px-4 sm:px-4 lg:px-6">
      <div className="mx-auto max-w-6xl relative">
        <div
          className="absolute -top-8 -right-2 -bottom-8 -left-2 md:-top-12 md:-right-6 md:-bottom-12 md:-left-6 bg-gray-900/40 dark:bg-gray-900/40 rounded-md"
          style={{
            border: `2px solid ${borderColor}`,
          }}
        ></div>
        <div className="relative p-4 md:p-6">
          {/* Section Header */}
          <div className="mb-8 md:mb-12">
            <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
              A workflow built for how you think
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
                          way.image === "/attachments.png"
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
                          way.image === "/attachments.png"
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

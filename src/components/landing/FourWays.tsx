"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Image from "next/image";
import { getCardAccentColor } from "@/lib/workspace-state/colors";
import type { CardColor } from "@/lib/workspace-state/colors";

// Register ScrollTrigger plugin
if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

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
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const wayRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLButtonElement | null)[][]>(ways.map(() => []));
  const borderColor = getCardAccentColor("#EC4899" as CardColor, 0.2); // Pink border

  useGSAP(
    () => {
      if (!sectionRef.current || !containerRef.current || !headingRef.current) return;

      const wayElements = wayRefs.current.filter(Boolean) as HTMLDivElement[];
      if (wayElements.length === 0) return;

      // Calculate total duration based on viewport height
      const buffer = 0.5;
      const stepDuration = 1;
      const numSections = wayElements.length;
      // Total timeline duration: (N-1) steps + start buffer + end buffer
      const totalTimelineTime = (numSections - 1) * stepDuration + 2 * buffer;

      // Scroll distance: ~0.6-0.7vh per step unit
      const totalDuration = window.innerHeight * 2.5;

      // Set initial states
      gsap.set(wayElements[0], { opacity: 1 });
      if (wayElements.length > 1) {
        gsap.set(wayElements.slice(1), { opacity: 0 });
      }

      // Create a master timeline
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top top",
          end: `+=${totalDuration}`,
          pin: sectionRef.current,
          pinSpacing: true,
          anticipatePin: 1,
          scrub: 0.1,
        },
      });

      // Ensure timeline covers the full duration including end buffer
      tl.to({}, { duration: 0 }, totalTimelineTime);

      // Heading animation (subtle entrance)
      tl.fromTo(
        headingRef.current,
        { opacity: 1, y: 0 },
        { opacity: 1, y: 0, duration: 0.1 },
        0
      );

      // Build timeline transitions for content sections
      wayElements.forEach((wayElement, index) => {
        if (index === 0) {
          tl.set(wayElement, { opacity: 1 }, 0);
          return;
        }

        const previousElement = wayElements[index - 1];

        // Center of the transition window
        const stepIndex = index - 1;
        const centerTime = buffer + stepIndex * stepDuration + stepDuration / 2;
        const transitionDuration = 0.05;
        const startTime = centerTime - transitionDuration / 2;

        // Crossfade elements
        tl.fromTo(
          previousElement,
          { opacity: 1 },
          {
            opacity: 0,
            duration: transitionDuration,
            ease: "power1.inOut",
          },
          startTime
        );

        tl.fromTo(
          wayElement,
          { opacity: 0 },
          {
            opacity: 1,
            duration: transitionDuration,
            ease: "power1.inOut",
          },
          startTime
        );
      });

      // Initialize all dots
      dotRefs.current.forEach((dotsForWay) => {
        if (!dotsForWay || dotsForWay.length === 0) return;
        dotsForWay.forEach((dot, dotIndex) => {
          if (!dot) return;
          // Initial state: first dot is active (1.3), others are inactive (1)
          tl.set(dot, { scale: dotIndex === 0 ? 1.3 : 1 }, 0);
        });
      });

      // Animate dots for each section transition
      for (let i = 0; i < numSections - 1; i++) {
        const timelinePosition = buffer + i * stepDuration;

        dotRefs.current.forEach((dotsForWay) => {
          if (!dotsForWay || dotsForWay.length === 0) return;

          dotsForWay.forEach((dot, dotIndex) => {
            if (!dot) return;

            if (dotIndex === i) {
              // Current active dot shrinks
              tl.fromTo(
                dot,
                { scale: 1.3 },
                { scale: 1, duration: stepDuration, ease: "none" },
                timelinePosition
              );
            } else if (dotIndex === i + 1) {
              // Next dot grows
              tl.fromTo(
                dot,
                { scale: 1 },
                { scale: 1.3, duration: stepDuration, ease: "none" },
                timelinePosition
              );
            }
          });
        });
      }

      return () => {
        ScrollTrigger.getAll().forEach((trigger) => {
          if (trigger.vars.trigger === sectionRef.current) {
            trigger.kill();
          }
        });
      };
    },
    { scope: sectionRef, dependencies: [ways] }
  );

  const scrollToWay = (targetIndex: number) => {
    if (!sectionRef.current) return;
    const st = ScrollTrigger.getAll().find((st) => st.trigger === sectionRef.current);
    if (!st) return;

    const buffer = 0.5;
    const stepDuration = 1;
    const numSections = ways.length;
    const totalTimelineTime = (numSections - 1) * stepDuration + 2 * buffer;

    const targetTime = buffer + targetIndex * stepDuration;
    const progress = targetTime / totalTimelineTime;
    const scrollPos = st.start + progress * (st.end - st.start);

    window.scrollTo({ top: scrollPos, behavior: "instant" });
  };

  return (
    <section ref={sectionRef} id="four-ways" className="min-h-screen px-4 sm:px-4 lg:px-6 pt-0 md:pt-16 pb-0 md:pb-8 flex flex-col justify-center">
      <div className="mx-auto max-w-6xl w-full">
        <div ref={containerRef} className="relative p-2 md:p-6 w-full">
          <div
            className="absolute -top-8 -right-2 -bottom-2 -left-2 md:-top-12 md:-right-6 md:-bottom-4 md:-left-6 bg-gray-900/40 dark:bg-gray-900/40 rounded-md"
            style={{
              border: `2px solid ${borderColor}`,
            }}
          ></div>
          <div ref={headingRef} className="mt-0 md:mt-2 mb-4 md:mb-6 flex items-center justify-between gap-8">
            <h2 className="text-3xl font-normal tracking-normal text-foreground sm:text-4xl md:text-5xl">
              A workflow built for how you think
            </h2>
          </div>

          <div className="rounded-md px-2 md:px-8 pb-2 md:pb-3">
            <div className="relative min-h-[380px] md:min-h-[420px]">
              {ways.map((way, index) => (
                <div
                  key={way.id}
                  ref={(el) => {
                    wayRefs.current[index] = el;
                  }}
                  className={`absolute inset-0 grid gap-6 md:gap-12 items-center md:grid-cols-[2fr_3fr] ${way.imageSide === "right" ? "" : "md:grid-flow-dense"
                    }`}
                >
                  {/* Text Content */}
                  <div
                    className={`space-y-4 md:space-y-6 text-center md:text-left ${way.imageSide === "right" ? "" : "md:col-start-2"
                      }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      {/* Numbered Dots Navigation */}
                      <div className="flex items-center gap-2 md:gap-3">
                        {ways.map((_, dotIndex) => (
                          <button
                            key={dotIndex}
                            onClick={() => scrollToWay(dotIndex)}
                            ref={(el) => {
                              if (!dotRefs.current[index]) {
                                dotRefs.current[index] = [];
                              }
                              dotRefs.current[index][dotIndex] = el;
                            }}
                            className={`flex h-6 w-6 md:h-8 md:w-8 items-center justify-center rounded-full text-xs md:text-sm font-medium cursor-pointer transition-colors ${index === dotIndex
                              ? "bg-foreground text-background"
                              : "bg-foreground/10 text-foreground/40 hover:bg-foreground/20"
                              }`}
                            style={{
                              transform: index === dotIndex && index === 0 ? "scale(1.3)" : "scale(1)",
                            }}
                          >
                            {dotIndex + 1}
                          </button>
                        ))}
                      </div>

                      <h3 className="text-2xl font-medium tracking-tight text-foreground sm:text-3xl text-center">
                        {way.title}
                      </h3>
                    </div>
                    <ul className="space-y-2 text-base md:text-lg leading-relaxed text-muted-foreground list-disc list-inside w-full md:mx-0">
                      {way.bullets.map((bullet, bulletIndex) => (
                        <li key={bulletIndex}>{bullet}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Screenshot */}
                  <div
                    className={`relative flex items-center justify-center ${way.imageSide === "right" ? "" : "md:col-start-1 md:row-start-1"
                      }`}
                  >
                    {/* Mobile: Fixed aspect ratio with object-cover */}
                    <div className="relative w-full aspect-[4/3] h-[150px] overflow-hidden rounded-md border border-foreground/10 bg-muted/30 backdrop-blur-sm md:hidden">
                      <Image
                        src={way.image}
                        alt={way.title}
                        fill
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
                        unoptimized
                      />
                    </div>
                    {/* Desktop: Fixed size container */}
                    <div className="hidden md:flex relative w-full h-[320px] overflow-hidden rounded-md border border-foreground/10 bg-muted/30 backdrop-blur-sm items-center justify-center">
                      <Image
                        src={way.image}
                        alt={way.title}
                        width={800}
                        height={600}
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
                        unoptimized
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}



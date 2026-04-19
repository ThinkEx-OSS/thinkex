import type { Metadata } from "next";
import Link from "next/link";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";

export const metadata: Metadata = {
  title: "ThinkEx – Your Docs, Media, and AI in One Place",
  description:
    "ThinkEx is a visual thinking workspace where your PDFs, videos, notes, and AI conversations come together on a single canvas. Study, research, and synthesize information without switching between tabs.",
  alternates: { canonical: "https://thinkex.app/" },
  openGraph: {
    title: "ThinkEx – Your Docs, Media, and AI in One Place",
    description:
      "A visual thinking workspace for PDFs, videos, notes, and AI chat. Made for students, researchers, and anyone who learns deeply.",
    url: "https://thinkex.app/",
    siteName: "ThinkEx",
    images: [
      { url: "/opengraph.png", width: 1200, height: 630, alt: "ThinkEx" },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ThinkEx – Your Docs, Media, and AI in One Place",
    description:
      "A visual thinking workspace for PDFs, videos, notes, and AI chat.",
    images: ["/opengraph.png"],
  },
};

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LandingHeader />
      <main>
        <section className="relative px-6 pt-28 pb-20 md:pt-36 md:pb-28">
          <div className="mx-auto max-w-5xl text-center">
            <div className="mb-8 flex items-center justify-center gap-3">
              <ThinkExLogo size={48} />
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                ThinkEx
              </h1>
            </div>
            <p className="mb-6 text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              Your Docs, Media, and AI in One Place
            </p>
            <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-muted-foreground md:text-xl">
              ThinkEx is a visual thinking workspace where PDFs, videos, notes,
              and AI conversations come together on a single canvas. Study,
              research, and synthesize information without switching between
              endless tabs and windows.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/sign-up"
                className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Get started free
              </Link>
              <Link
                href="/auth/sign-in"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
              >
                Sign in
              </Link>
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Free to try · No credit card required · Open source
            </p>
          </div>
        </section>

        <section className="border-t border-border/50 px-6 py-16 md:py-24">
          <div className="mx-auto max-w-4xl">
            <h2 className="mb-6 text-center text-3xl font-semibold tracking-tight md:text-4xl">
              What is ThinkEx?
            </h2>
            <div className="space-y-5 text-base leading-relaxed text-muted-foreground md:text-lg">
              <p>
                Today&apos;s apps and AI split what should be a single, fluid
                process. AI reasoning happens in isolated chat threads, while
                your information is scattered across tabs, windows, and browser
                bookmarks.
              </p>
              <p>
                ThinkEx brings it all together. Imagine a large desk where you
                can spread out textbooks, lecture slides, research papers,
                YouTube videos, lecture recordings, and your own notes
                side-by-side. You look across everything, connect ideas, compare
                sources, and ask questions. ThinkEx is that desk, in your
                browser, with AI that works alongside you on exactly the context
                you choose.
              </p>
              <p>
                It&apos;s made for students preparing for exams, researchers
                synthesizing literature, writers organizing sources, and anyone
                who learns better when they can see and arrange everything at
                once.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t border-border/50 px-6 py-16 md:py-24">
          <div className="mx-auto max-w-6xl">
            <h2 className="mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
              Everything you need, on one canvas
            </h2>
            <p className="mx-auto mb-14 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
              ThinkEx combines sources, notes, and AI into a single workspace
              you control.
            </p>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              <FeatureCard
                title="Upload documents"
                description="Bring in PDFs, images, Word docs, and slides. Read and highlight them natively, without downloads or separate viewers."
              />
              <FeatureCard
                title="Link videos and web pages"
                description="Add YouTube videos and websites. ThinkEx pulls transcripts and content so you can search, quote, and ask the AI about them."
              />
              <FeatureCard
                title="Record lectures and meetings"
                description="Record directly in a workspace. Get searchable transcripts and AI-generated summaries alongside your own notes."
              />
              <FeatureCard
                title="AI you control"
                description="Pick the exact cards, paragraphs, or documents the AI sees. No opaque retrieval. Switch models per task between Google, Anthropic, and OpenAI."
              />
              <FeatureCard
                title="Notes, flashcards, and quizzes"
                description="Turn any source into study material. Save AI-generated notes, flashcards, and practice questions as permanent cards in your workspace."
              />
              <FeatureCard
                title="Spatial canvas"
                description="Arrange everything on a zoomable canvas. See connections between your documents, notes, and chat at a glance."
              />
              <FeatureCard
                title="Share and collaborate"
                description="Invite classmates or teammates, share a workspace publicly, or export to Google Docs and Drive when you're done."
              />
              <FeatureCard
                title="Open source and self-hostable"
                description="AGPL-3.0 licensed. Run ThinkEx on your own server with Docker and PostgreSQL if you prefer full control over your data."
              />
              <FeatureCard
                title="Private by design"
                description="Your data is yours. Read our Privacy Policy to see exactly what we collect and how AI providers process your prompts."
              />
            </div>
          </div>
        </section>

        <section className="border-t border-border/50 px-6 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
              How ThinkEx works
            </h2>
            <p className="mx-auto mb-14 max-w-2xl text-center text-base text-muted-foreground md:text-lg">
              Four steps from scattered sources to compounded knowledge.
            </p>
            <div className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
              <Step
                number="01"
                title="Bring everything in"
                description="Upload PDFs and slides, paste YouTube links, drop in lecture recordings, and write your own notes. Everything lives as a card on your canvas."
              />
              <Step
                number="02"
                title="Arrange and compare"
                description="Move cards around so related sources sit next to each other. Compare a paper to a lecture slide or a note to a definition, side-by-side."
              />
              <Step
                number="03"
                title="Ask AI about what you choose"
                description="Select the exact cards or passages you want the AI to work with. Ask questions, get summaries, or generate flashcards grounded in those sources."
              />
              <Step
                number="04"
                title="Capture what you learn"
                description="Save answers, notes, and flashcards back onto the canvas as permanent cards. Your understanding builds up over time instead of scrolling away in a chat."
              />
            </div>
          </div>
        </section>

        <section className="border-t border-border/50 px-6 py-16 md:py-24">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-4 text-center text-3xl font-semibold tracking-tight md:text-4xl">
              Who uses ThinkEx
            </h2>
            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              <UseCase
                title="Students"
                description="Turn lecture recordings, slides, and textbook chapters into one study workspace. Generate flashcards and practice quizzes from your own material."
              />
              <UseCase
                title="Researchers"
                description="Synthesize across dozens of papers. Pin key passages, compare methodologies, and ask AI to find contradictions you'd otherwise miss."
              />
              <UseCase
                title="Writers and analysts"
                description="Collect sources for an article or report, arrange them visually, and let AI help you draft with full visibility into what it's citing."
              />
            </div>
          </div>
        </section>

        <section className="border-t border-border/50 px-6 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Start thinking in ThinkEx
            </h2>
            <p className="mb-8 text-base text-muted-foreground md:text-lg">
              Free to try in your browser. Upload a document or paste a link to
              get started in under a minute.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/auth/sign-up"
                className="inline-flex h-11 items-center justify-center rounded-md bg-foreground px-6 text-sm font-medium text-background transition-opacity hover:opacity-90"
              >
                Create your free account
              </Link>
              <Link
                href="/privacy"
                className="inline-flex h-11 items-center justify-center rounded-md border border-border bg-background px-6 text-sm font-medium transition-colors hover:bg-muted"
              >
                Read our Privacy Policy
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}

function FeatureCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-sidebar/30 p-6">
      <h3 className="mb-2 text-base font-semibold md:text-lg">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        {description}
      </p>
    </div>
  );
}

function Step({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="mb-2 font-mono text-xs text-muted-foreground/70">
        {number}
      </div>
      <h3 className="mb-2 text-lg font-semibold md:text-xl">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        {description}
      </p>
    </div>
  );
}

function UseCase({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-sidebar/30 p-6">
      <h3 className="mb-2 text-base font-semibold md:text-lg">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground md:text-base">
        {description}
      </p>
    </div>
  );
}

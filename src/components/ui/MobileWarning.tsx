"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ThinkExLogo } from "@/components/ui/thinkex-logo";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { useIsMobileDevice } from "@/hooks/ui/use-mobile-device";
import { CheckCircle2, Loader2, Monitor } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function MobileLandingPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/mobile-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(data?.error || "Failed to send email");
      }

      setIsSent(true);
      setEmail(normalizedEmail);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send email",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-y-auto">
      <div className="min-h-full">
        <div className="border-b border-border/50">
          <div className="mx-auto flex max-w-md items-center gap-2 px-4 py-4">
            <ThinkExLogo size={24} priority />
            <span className="text-lg font-semibold text-foreground">
              ThinkEx
            </span>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 py-8">
          <div className="flex flex-col gap-3 text-center">
            <h1 className="text-2xl font-semibold text-foreground">
              ThinkEx is built for desktop
            </h1>
            <p className="text-base text-muted-foreground">
              Watch what you can do on your computer
            </p>
          </div>

          <div className="w-full overflow-hidden rounded-xl border border-border/50 bg-black aspect-video">
            <video
              src="/finaldemo.mp4"
              muted
              playsInline
              controls
              className="h-full w-full object-cover"
            >
              Your browser does not support the video tag.
            </video>
          </div>

          <div className="flex flex-col gap-4">
            <h2 className="text-center text-lg font-medium text-foreground">
              Get the link in your inbox
            </h2>

            {isSent ? (
              <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-6 text-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                <p className="text-sm font-medium text-foreground">
                  Check your inbox!
                </p>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
            ) : (
              <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-label="Email address"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={isSubmitting}
                  className="h-11"
                  required
                />
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 w-full"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send me the link"
                  )}
                </Button>
              </form>
            )}
          </div>

          <p className="pb-2 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} ThinkEx
          </p>
        </div>
      </div>
    </div>
  );
}

function SmallScreenWarning() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-lg">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-blue-500/10 p-4">
            <Monitor className="h-10 w-10 text-blue-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">
              Window too small
            </h2>
            <p className="text-sm text-muted-foreground">
              Please resize your browser window to continue using ThinkEx.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MobileWarning() {
  const isMobileDevice = useIsMobileDevice();
  const isSmallScreen = useIsMobile();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  if (isMobileDevice) {
    return <MobileLandingPage />;
  }

  if (isSmallScreen) {
    return <SmallScreenWarning />;
  }

  return null;
}

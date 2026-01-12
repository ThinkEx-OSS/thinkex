"use client";

import { useIsMobile } from "@/hooks/ui/use-mobile";
import { Smartphone } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

export function MobileWarning() {
  const isMobile = useIsMobile();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Don't render on server or if not mobile
  if (!isMounted || !isMobile) {
    return null;
  }

  const emailSubject = encodeURIComponent("Mobile Support Request");
  const emailBody = encodeURIComponent(`Hi,

I'm interested in mobile support for ThinkEx.

`);

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg shadow-lg max-w-md w-full p-6">
        <div className="flex flex-col items-center text-center space-y-4">
          <div className="bg-amber-500/10 p-4 rounded-full">
            <Smartphone className="h-12 w-12 text-amber-500" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">Mobile Not Supported</h2>
            <p className="text-muted-foreground">
              ThinkEx is currently optimized for desktop use only. For the best experience, please access ThinkEx from a desktop or laptop computer.
            </p>
          </div>

          <div className="w-full pt-2 space-y-3">
            <p className="text-sm text-muted-foreground">
              Interested in mobile support? Let us know at{" "}
              <a 
                href={`mailto:support@thinkex.app?subject=${emailSubject}&body=${emailBody}`}
                className="underline hover:text-amber-400 transition-colors text-amber-500"
              >
                support@thinkex.app
              </a>
            </p>

            <div className="pt-2">
              <Button
                onClick={() => {
                  window.location.href = `mailto:support@thinkex.app?subject=${emailSubject}&body=${emailBody}`;
                }}
                className="w-full"
              >
                I'm interested
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

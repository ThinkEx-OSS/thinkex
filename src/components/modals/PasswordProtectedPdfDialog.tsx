"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ExternalLink } from "lucide-react";

const UNLOCK_URL = "https://www.ilovepdf.com/unlock_pdf";

interface PasswordProtectedPdfEvent {
  fileNames: string[];
}

// Simple global event bus so non-React code (e.g. SupabaseAttachmentAdapter) can trigger the dialog
type Listener = (e: PasswordProtectedPdfEvent) => void;
const listeners = new Set<Listener>();

export function emitPasswordProtectedPdf(fileNames: string[]) {
  listeners.forEach((fn) => fn({ fileNames }));
}

/**
 * Global dialog that warns users about password-protected PDFs
 * and links them to iLovePDF to unlock.
 *
 * Mount this once near the app root (e.g. in DashboardLayout or ModalManager).
 */
export function PasswordProtectedPdfDialog() {
  const [open, setOpen] = useState(false);
  const [fileNames, setFileNames] = useState<string[]>([]);

  const handleEvent = useCallback((e: PasswordProtectedPdfEvent) => {
    setFileNames(e.fileNames);
    setOpen(true);
  }, []);

  useEffect(() => {
    listeners.add(handleEvent);
    return () => {
      listeners.delete(handleEvent);
    };
  }, [handleEvent]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" />
            Password-Protected PDF{fileNames.length > 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            We don&apos;t support password-protected PDFs. You can unlock{" "}
            {fileNames.length === 1 ? "it" : "them"} for free, then upload the
            unlocked version{fileNames.length > 1 ? "s" : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-md border bg-muted/50 p-3">
            <p className="text-sm font-medium mb-1">
              {fileNames.length === 1 ? "File:" : "Files:"}
            </p>
            <ul className="text-sm text-muted-foreground space-y-0.5">
              {fileNames.map((name) => (
                <li key={name} className="truncate">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button asChild onClick={() => setOpen(false)}>
            <a href={UNLOCK_URL} target="_blank" rel="noopener noreferrer">
              Unlock PDF
              <ExternalLink className="ml-2 size-4" />
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

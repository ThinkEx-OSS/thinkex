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
import { FileWarning, ExternalLink } from "lucide-react";
import { CONVERT_URLS } from "@/lib/uploads/office-document-validation";

export interface OfficeDocumentRejectedEvent {
  word?: string[];
  excel?: string[];
  powerpoint?: string[];
}

type Listener = (e: OfficeDocumentRejectedEvent) => void;
const listeners = new Set<Listener>();

export function emitOfficeDocumentRejected(event: OfficeDocumentRejectedEvent) {
  if (
    (!event.word || event.word.length === 0) &&
    (!event.excel || event.excel.length === 0) &&
    (!event.powerpoint || event.powerpoint.length === 0)
  ) {
    return;
  }
  listeners.forEach((fn) => fn(event));
}

const SECTIONS: Array<{
  key: keyof OfficeDocumentRejectedEvent;
  label: string;
  extLabel: string;
  convertUrl: string;
}> = [
  {
    key: "word",
    label: "Word",
    extLabel: ".doc, .docx",
    convertUrl: CONVERT_URLS.word,
  },
  {
    key: "excel",
    label: "Excel",
    extLabel: ".xls, .xlsx",
    convertUrl: CONVERT_URLS.excel,
  },
  {
    key: "powerpoint",
    label: "PowerPoint",
    extLabel: ".ppt, .pptx",
    convertUrl: CONVERT_URLS.powerpoint,
  },
];

/**
 * Global dialog for rejected Office documents (Word, Excel, PowerPoint).
 * Links users to iLovePDF to convert to PDF.
 */
export function OfficeDocumentRejectedDialog() {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<OfficeDocumentRejectedEvent>({});

  const handleEvent = useCallback((e: OfficeDocumentRejectedEvent) => {
    setEvent(e);
    setOpen(true);
  }, []);

  useEffect(() => {
    listeners.add(handleEvent);
    return () => {
      listeners.delete(handleEvent);
    };
  }, [handleEvent]);

  const sections = SECTIONS.filter((s) => {
    const names = event[s.key];
    return names && names.length > 0;
  });

  const totalCount = sections.reduce(
    (sum, s) => sum + (event[s.key]?.length ?? 0),
    0
  );

  const title =
    sections.length === 1
      ? `${sections[0].label}${(event[sections[0].key]?.length ?? 0) > 1 ? " files" : " file"} not supported`
      : `${totalCount} Office files not supported`;

  const description =
    sections.length === 1
      ? `We don't support ${sections[0].label} (${sections[0].extLabel}) files. Convert to PDF first, then upload.`
      : "We don't support Word, Excel, or PowerPoint files. Convert them to PDF first, then upload.";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileWarning className="size-5 text-destructive" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {sections.map((section) => {
            const names = event[section.key] ?? [];
            return (
              <div
                key={section.key}
                className="rounded-md border bg-muted/50 p-3"
              >
                <p className="text-sm font-medium mb-1">
                  {section.label} ({names.length})
                </p>
                <ul className="text-sm text-muted-foreground space-y-0.5">
                  {names.map((name, i) => (
                    <li key={`${section.key}-${i}-${name}`} className="truncate">
                      {name}
                    </li>
                  ))}
                </ul>
                <Button asChild variant="link" className="h-auto p-0 mt-2 text-xs">
                  <a
                    href={section.convertUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Convert {section.label} to PDF
                    <ExternalLink className="ml-1 inline size-3" />
                  </a>
                </Button>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

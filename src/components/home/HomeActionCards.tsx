import { Upload, Link as LinkIcon, ClipboardPaste, Mic, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type HoverVariant = "upload" | "link" | "paste" | "record";

const HOVER_VARIANT_STYLES: Record<HoverVariant, string> = {
    upload: "hover:border-emerald-500/60 hover:shadow-[0_0_24px_-4px_rgba(16,185,129,0.35)] [&:hover_.action-icon]:text-emerald-600 dark:[&:hover_.action-icon]:text-emerald-400 [&:hover_.action-icon]:animate-[icon-upload-bounce_0.8s_ease-in-out_infinite]",
    link: "hover:border-blue-500/60 hover:shadow-[0_0_24px_-4px_rgba(59,130,246,0.35)] [&:hover_.action-icon]:text-blue-600 dark:[&:hover_.action-icon]:text-blue-400 [&:hover_.action-icon]:animate-[icon-link-sway_0.8s_ease-in-out_infinite]",
    paste: "hover:border-amber-500/60 hover:shadow-[0_0_24px_-4px_rgba(245,158,11,0.35)] [&:hover_.action-icon]:text-amber-600 dark:[&:hover_.action-icon]:text-amber-400 [&:hover_.action-icon]:animate-[icon-paste-pop_0.8s_ease-in-out_infinite]",
    record: "hover:border-rose-500/60 hover:shadow-[0_0_24px_-4px_rgba(244,63,94,0.35)] [&:hover_.action-icon]:text-rose-600 dark:[&:hover_.action-icon]:text-rose-400 [&:hover_.action-icon]:animate-[icon-link-pulse_0.8s_ease-in-out_infinite]",
};

interface ActionCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onClick?: () => void;
    isLoading?: boolean;
    hoverVariant?: HoverVariant;
    /** When set, renders as label for native file picker—avoids JS round-trip and OS delay feels shorter */
    htmlFor?: string;
}

function ActionCard({ icon, title, subtitle, onClick, isLoading, hoverVariant = "upload", htmlFor }: ActionCardProps) {
    const sharedClassName = cn(
        "group flex flex-col items-start gap-2 p-4 min-h-[88px] w-full rounded-2xl border bg-white/95 dark:bg-sidebar/95",
        "hover:scale-[1.02] hover:-translate-y-0.5 active:scale-[0.98] active:translate-y-0 transition-transform duration-300 ease-out text-left cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        !isLoading && HOVER_VARIANT_STYLES[hoverVariant]
    );

    const content = (
        <>
            <div className={cn("action-icon text-foreground flex-shrink-0 transition-colors duration-300", isLoading && "text-muted-foreground")}>
                {icon}
            </div>
            <div className="flex flex-col items-start">
                <div className="action-title font-medium text-sm text-foreground transition-colors duration-300">{title}</div>
                <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
        </>
    );

    if (htmlFor && !isLoading) {
        return (
            <label htmlFor={htmlFor} className={sharedClassName}>
                {content}
            </label>
        );
    }

    return (
        <button
            type="button"
            onClick={onClick}
            disabled={isLoading}
            className={sharedClassName}
        >
            {content}
        </button>
    );
}

interface HomeActionCardsProps {
    onUpload: () => void;
    onLink: () => void;
    onPasteText: () => void;
    onRecord: () => void;
    isLoading?: boolean;
    /** ID of the hidden file input—enables native label click for instant file picker */
    uploadInputId?: string;
}

export function HomeActionCards({ onUpload, onLink, onPasteText, onRecord, isLoading, uploadInputId }: HomeActionCardsProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-[760px]">
            <ActionCard
                icon={<Upload className="h-6 w-6" />}
                title="Upload"
                subtitle="PDF, Image, Audio"
                onClick={onUpload}
                isLoading={isLoading}
                hoverVariant="upload"
                htmlFor={uploadInputId}
            />
            <ActionCard
                icon={<LinkIcon className="h-6 w-6" />}
                title="Link"
                subtitle="YouTube, Website"
                onClick={onLink}
                isLoading={isLoading}
                hoverVariant="link"
            />
            <ActionCard
                icon={<ClipboardPaste className="h-6 w-6" />}
                title="Paste"
                subtitle="From Clipboard"
                onClick={onPasteText}
                isLoading={isLoading}
                hoverVariant="paste"
            />
            <ActionCard
                icon={isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Mic className="h-6 w-6" />}
                title="Record"
                subtitle="Lectures, Meetings"
                onClick={onRecord}
                isLoading={isLoading}
                hoverVariant="record"
            />
        </div>
    );
}

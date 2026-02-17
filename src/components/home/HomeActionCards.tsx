import { Upload, Link as LinkIcon, ClipboardPaste, Mic, FolderPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onClick?: () => void;
    isLoading?: boolean;
    /** When set, renders as label for native file picker—avoids JS round-trip and OS delay feels shorter */
    htmlFor?: string;
}

function ActionCard({ icon, title, subtitle, onClick, isLoading, htmlFor }: ActionCardProps) {
    const sharedClassName = cn(
        "flex flex-col items-start gap-2 p-4 min-h-[88px] w-full rounded-2xl border bg-white dark:bg-sidebar backdrop-blur-xl hover:bg-neutral-50 dark:hover:bg-accent hover:text-accent-foreground hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 text-left cursor-pointer",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50"
    );

    const content = (
        <>
            <div className="text-foreground flex-shrink-0">
                {icon}
            </div>
            <div className="flex flex-col items-start">
                <div className="font-medium text-sm text-foreground">{title}</div>
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
    onStartFromScratch: () => void;
    isLoading?: boolean;
    /** ID of the hidden file input—enables native label click for instant file picker */
    uploadInputId?: string;
}

export function HomeActionCards({ onUpload, onLink, onPasteText, onRecord, onStartFromScratch, isLoading, uploadInputId }: HomeActionCardsProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 w-full max-w-[760px]">
            <ActionCard
                icon={<Upload className="h-6 w-6" />}
                title="Upload"
                subtitle="PDF, Image, Audio"
                onClick={onUpload}
                isLoading={isLoading}
                htmlFor={uploadInputId}
            />
            <ActionCard
                icon={<LinkIcon className="h-6 w-6" />}
                title="Link"
                subtitle="YouTube, Website"
                onClick={onLink}
                isLoading={isLoading}
            />
            <ActionCard
                icon={<ClipboardPaste className="h-6 w-6" />}
                title="Paste"
                subtitle="From clipboard"
                onClick={onPasteText}
                isLoading={isLoading}
            />
            <ActionCard
                icon={<Mic className="h-6 w-6" />}
                title="Record"
                subtitle="Lectures, Meetings"
                onClick={onRecord}
                isLoading={isLoading}
            />
            <ActionCard
                icon={isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <FolderPlus className="h-6 w-6" />}
                title="Start fresh"
                subtitle="Empty Workspace"
                onClick={onStartFromScratch}
                isLoading={isLoading}
            />
        </div>
    );
}

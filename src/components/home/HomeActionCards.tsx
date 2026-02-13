import { Upload, Link as LinkIcon, Mic, FolderPlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ActionCardProps {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    onClick?: () => void;
    isLoading?: boolean;
}

function ActionCard({ icon, title, subtitle, onClick, isLoading }: ActionCardProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={isLoading}
            className={cn(
                "flex items-center gap-3 p-4 h-16 w-full rounded-2xl border bg-sidebar backdrop-blur-xl hover:bg-accent hover:text-accent-foreground transition-all text-left cursor-pointer",
                "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:pointer-events-none disabled:opacity-50"
            )}
        >
            <div className="text-foreground/70 flex-shrink-0">
                {icon}
            </div>
            <div className="flex flex-col">
                <div className="font-medium text-sm text-foreground">{title}</div>
                <div className="text-xs text-muted-foreground">{subtitle}</div>
            </div>
        </button>
    );
}

interface HomeActionCardsProps {
    onUpload: () => void;
    onLink: () => void;
    onRecord: () => void;
    onStartFromScratch: () => void;
    isLoading?: boolean;
}

export function HomeActionCards({ onUpload, onLink, onRecord, onStartFromScratch, isLoading }: HomeActionCardsProps) {
    return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-[760px]">
            <ActionCard
                icon={<Upload className="h-6 w-6" />}
                title="Upload"
                subtitle="PDF, Image, Audio"
                onClick={() => {}}
                isLoading={false}
            />
            <ActionCard
                icon={<LinkIcon className="h-6 w-6" />}
                title="Link"
                subtitle="YouTube, Website"
                onClick={onLink}
            />
            <ActionCard
                icon={<Mic className="h-6 w-6" />}
                title="Record"
                subtitle="Lectures, Meetings"
                onClick={onRecord}
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

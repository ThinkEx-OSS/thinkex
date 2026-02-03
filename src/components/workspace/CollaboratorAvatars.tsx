/**
 * CollaboratorAvatars - Shows avatars of users currently in the workspace
 */

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useRealtimeContextOptional } from "@/contexts/RealtimeContext";
import { cn } from "@/lib/utils";

interface CollaboratorAvatarsProps {
    className?: string;
    maxAvatars?: number;
}

/**
 * Displays avatars of collaborators currently in the workspace
 * Shows tooltip with name and what they're editing
 */
export function CollaboratorAvatars({
    className,
    maxAvatars = 3,
}: CollaboratorAvatarsProps) {
    const realtime = useRealtimeContextOptional();

    if (!realtime || realtime.collaborators.length === 0) {
        return null;
    }

    const visibleCollaborators = realtime.collaborators.slice(0, maxAvatars);
    const remainingCount = Math.max(0, realtime.collaborators.length - maxAvatars);

    return (
        <TooltipProvider>
            <div className={cn("flex items-center -space-x-2", className)}>
                {visibleCollaborators.map((collaborator) => (
                    <Tooltip key={collaborator.userId}>
                        <TooltipTrigger asChild>
                            <Avatar className="size-7 ring-2 ring-background cursor-default">
                                <AvatarImage src={collaborator.userImage} alt={collaborator.userName} />
                                <AvatarFallback className="text-[10px] bg-primary text-primary-foreground">
                                    {getInitials(collaborator.userName)}
                                </AvatarFallback>
                            </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            <div className="font-medium">{collaborator.userName}</div>
                        </TooltipContent>
                    </Tooltip>
                ))}

                {remainingCount > 0 && (
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Avatar className="size-7 ring-2 ring-background cursor-default">
                                <AvatarFallback className="text-[10px] bg-muted text-muted-foreground">
                                    +{remainingCount}
                                </AvatarFallback>
                            </Avatar>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="text-xs">
                            {remainingCount} other collaborator{remainingCount > 1 ? 's' : ''}
                        </TooltipContent>
                    </Tooltip>
                )}
            </div>
        </TooltipProvider>
    );
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
}

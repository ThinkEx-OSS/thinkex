import { useQuery } from "@tanstack/react-query";

import {
	Avatar,
	AvatarFallback,
	AvatarGroup,
	AvatarGroupCount,
	AvatarImage,
} from "#/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "#/components/ui/hover-card";
import type { WorkspacePresenceUser } from "#/features/workspaces/realtime/messages";
import { getAuthSessionQueryOptions } from "#/lib/session-query";

interface WorkspacePresenceProps {
	status: "connecting" | "connected" | "disconnected";
	users: WorkspacePresenceUser[];
}

function getInitials(name: string) {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	const first = parts[0]?.[0] ?? "";
	const second = parts[1]?.[0] ?? "";
	const fallback = name[0] ?? "?";

	return `${first}${second}`.toUpperCase() || fallback.toUpperCase();
}

export function WorkspacePresence({ status, users }: WorkspacePresenceProps) {
	const { data: session } = useQuery(getAuthSessionQueryOptions());
	const currentUserId = session?.user.id;
	const otherUsers = currentUserId ? users.filter((user) => user.id !== currentUserId) : [];
	const visibleUsers = otherUsers.slice(0, 3);
	const overflowCount = Math.max(otherUsers.length - visibleUsers.length, 0);

	if (otherUsers.length === 0 || status !== "connected") {
		return null;
	}

	const label = otherUsers.map((user) => user.name).join(", ");

	return (
		<HoverCard>
			<HoverCardTrigger
				delay={250}
				render={
					<button
						type="button"
						className="flex h-6 cursor-default items-center rounded-full bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label={label}
					/>
				}
			>
				<AvatarGroup>
					{visibleUsers.map((user) => (
						<Avatar key={user.connectionId} size="sm">
							<AvatarImage src={user.image ?? undefined} alt="" />
							<AvatarFallback>{getInitials(user.name)}</AvatarFallback>
						</Avatar>
					))}
					{overflowCount > 0 ? <AvatarGroupCount>+{overflowCount}</AvatarGroupCount> : null}
				</AvatarGroup>
			</HoverCardTrigger>
			<HoverCardContent align="end" className="w-56 rounded-md p-2">
				<div className="space-y-1">
					{otherUsers.map((user) => (
						<div
							key={user.connectionId}
							className="flex min-w-0 items-center gap-2 rounded-sm px-2 py-1.5"
						>
							<Avatar size="sm">
								<AvatarImage src={user.image ?? undefined} alt="" />
								<AvatarFallback>{getInitials(user.name)}</AvatarFallback>
							</Avatar>
							<p className="min-w-0 truncate text-sm font-medium">{user.name}</p>
						</div>
					))}
				</div>
			</HoverCardContent>
		</HoverCard>
	);
}

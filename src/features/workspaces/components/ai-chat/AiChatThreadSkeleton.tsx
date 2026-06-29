import { Skeleton } from "#/components/ui/skeleton";

export default function AiChatThreadSkeleton() {
	return (
		<div aria-hidden="true" className="flex flex-col gap-6">
			<AssistantMessageSkeleton />
			<UserMessageSkeleton />
			<AssistantMessageSkeleton isCompact />
		</div>
	);
}

function AssistantMessageSkeleton({
	isCompact = false,
}: {
	isCompact?: boolean;
} = {}) {
	return (
		<div className="max-w-full space-y-2">
			<Skeleton className="h-3 w-20 rounded-sm" />
			<div className="space-y-2">
				<Skeleton className="h-4 w-full rounded-sm" />
				<Skeleton className="h-4 w-11/12 rounded-sm" />
				{isCompact ? null : (
					<>
						<Skeleton className="h-4 w-4/5 rounded-sm" />
						<Skeleton className="h-4 w-2/3 rounded-sm" />
					</>
				)}
			</div>
		</div>
	);
}

function UserMessageSkeleton() {
	return (
		<div className="ml-auto max-w-[88%]">
			<Skeleton className="h-10 rounded-lg bg-secondary" />
		</div>
	);
}

import { LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { DeleteAccountSection } from "#/features/account/components/DeleteAccountSection";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemSeparator,
	ItemTitle,
} from "#/components/ui/item";

interface AccountSectionProps {
	createdAt?: Date | string | null;
	email?: string | null;
	image?: string | null;
	name?: string | null;
	onSignOut: () => void;
}

export function AccountSection({ createdAt, email, image, name, onSignOut }: AccountSectionProps) {
	const displayName = name || email || "Guest";
	const memberSince = formatMemberSince(createdAt);

	return (
		// No heading: the active tab already says which section this is. gap-0 /
		// my-0 / px-0 undo the defaults — ItemGroup adds gap-2.5 and ItemSeparator
		// my-2, which together leave a dead band around every divider.
		<ItemGroup className="gap-0">
			{/* Email sits under the name rather than in its own row: guests have no
				    email, and a row reading "—" is worse than no row. */}
			<Item size="sm" className="px-0">
				<Avatar className="size-9">
					<AvatarImage src={image ?? undefined} alt="" />
					<AvatarFallback>{displayName.charAt(0).toUpperCase()}</AvatarFallback>
				</Avatar>
				<ItemContent className="gap-0.5">
					<ItemTitle>{displayName}</ItemTitle>
					{email ? <ItemDescription>{email}</ItemDescription> : null}
				</ItemContent>
			</Item>

			{memberSince ? (
				<Item size="sm" className="px-0">
					<ItemContent>
						<ItemTitle className="font-normal text-muted-foreground">Member since</ItemTitle>
					</ItemContent>
					<span className="text-sm text-foreground">{memberSince}</span>
				</Item>
			) : null}

			<ItemSeparator className="my-0" />
			{/* Both account actions share a row: two buttons stacked with a divider
			    between them made a short list look like three separate sections. */}
			<Item size="sm" className="px-0">
				<Button variant="outline" size="sm" onClick={onSignOut}>
					<LogOut className="size-4" />
					Sign out
				</Button>
				<DeleteAccountSection />
			</Item>
		</ItemGroup>
	);
}

function formatMemberSince(createdAt: AccountSectionProps["createdAt"]) {
	if (!createdAt) {
		return null;
	}

	const date = createdAt instanceof Date ? createdAt : new Date(createdAt);

	return Number.isNaN(date.getTime())
		? null
		: date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

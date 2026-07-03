import { Link } from "@tanstack/react-router";

import { cn } from "#/lib/utils";

const navLinkClassName =
	"rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground";

const navLinkActiveClassName = "bg-muted text-foreground";

export function SettingsNav() {
	return (
		<nav aria-label="Settings" className="flex gap-1">
			<Link
				to="/settings"
				activeOptions={{ exact: true }}
				className={navLinkClassName}
				activeProps={{ className: cn(navLinkClassName, navLinkActiveClassName) }}
			>
				Profile
			</Link>
			<Link
				to="/settings/connections"
				className={navLinkClassName}
				activeProps={{ className: cn(navLinkClassName, navLinkActiveClassName) }}
			>
				Connections
			</Link>
		</nav>
	);
}

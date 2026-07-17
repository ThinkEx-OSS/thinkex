import type { ReactNode } from "react";

import ThinkExLogo from "#/components/ThinkExLogo";
import { cn } from "#/lib/utils";

interface AuthPageLayoutProps {
	children: ReactNode;
	footer?: ReactNode;
}

export default function AuthPageLayout({ children, footer }: AuthPageLayoutProps) {
	return (
		<div className="relative min-h-svh bg-background text-foreground">
			<main
				className={cn(
					"flex min-h-svh items-center justify-center px-6 py-12 sm:px-10",
					footer && "pb-24 sm:pb-28",
				)}
			>
				<div className="flex w-full max-w-md flex-col items-center gap-8 px-8 text-center sm:px-12">
					<ThinkExLogo size={36} />
					{children}
				</div>
			</main>
			{footer ? (
				<div className="absolute inset-x-6 bottom-6 mx-auto max-w-sm sm:bottom-8">{footer}</div>
			) : null}
		</div>
	);
}

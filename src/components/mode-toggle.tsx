import { Moon, Sun } from "lucide-react";

import { useTheme } from "#/components/theme-provider";
import { Button } from "#/components/ui/button";
import { cn } from "#/lib/utils";

export function ModeToggle({ className }: { className?: string }) {
	const { resolvedTheme, setTheme } = useTheme();

	return (
		<Button
			variant="ghost"
			size="icon-sm"
			className={cn("size-8 text-muted-foreground hover:text-foreground", className)}
			onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
			aria-label="Toggle theme"
		>
			<Sun className="size-3.5 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90" />
			<Moon className="absolute size-3.5 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0" />
			<span className="sr-only">Toggle theme</span>
		</Button>
	);
}

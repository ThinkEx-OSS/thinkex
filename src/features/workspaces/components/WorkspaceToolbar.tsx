import type { ComponentProps } from "react";

import { Button } from "#/components/ui/button";
import {
	workspaceToolbarGroupClassName,
	workspaceToolbarIconButtonClass,
	workspaceToolbarScrollGroupClassName,
	workspaceToolbarTextButtonClass,
} from "#/features/workspaces/components/workspace-toolbar-styles";
import { cn } from "#/lib/utils";

function WorkspaceToolbarGroup({
	className,
	scrollable = false,
	...props
}: ComponentProps<"div"> & { scrollable?: boolean }) {
	return (
		<div
			className={cn(
				scrollable ? workspaceToolbarScrollGroupClassName : workspaceToolbarGroupClassName,
				className,
			)}
			{...props}
		/>
	);
}

function WorkspaceToolbarIconButton({
	className,
	type = "button",
	variant = "ghost",
	size = "icon-sm",
	...props
}: ComponentProps<typeof Button>) {
	return (
		<Button
			type={type}
			variant={variant}
			size={size}
			className={cn(workspaceToolbarIconButtonClass, className)}
			{...props}
		/>
	);
}

function WorkspaceToolbarTextButton({
	className,
	type = "button",
	variant = "ghost",
	size = "sm",
	...props
}: ComponentProps<typeof Button>) {
	return (
		<Button
			type={type}
			variant={variant}
			size={size}
			className={cn(workspaceToolbarTextButtonClass, className)}
			{...props}
		/>
	);
}

export { WorkspaceToolbarGroup, WorkspaceToolbarIconButton, WorkspaceToolbarTextButton };

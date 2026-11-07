import type { ComponentProps, ReactNode } from "react";
import { Ellipsis } from "lucide-react";

import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
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

function WorkspaceResponsiveToolbar({
	children,
	mobileContent,
	mobileContentClassName,
	mobileLabel,
	scrollable = false,
}: {
	children: ReactNode;
	mobileContent: ReactNode;
	mobileContentClassName?: string;
	mobileLabel: string;
	scrollable?: boolean;
}) {
	return (
		<>
			<WorkspaceToolbarGroup className="@min-[40rem]/context:hidden">
				<WorkspaceToolbarMenuButton
					aria-label={mobileLabel}
					content={mobileContent}
					contentClassName={mobileContentClassName}
				/>
			</WorkspaceToolbarGroup>
			<WorkspaceToolbarGroup scrollable={scrollable} className="hidden @min-[40rem]/context:flex">
				{children}
			</WorkspaceToolbarGroup>
		</>
	);
}

function WorkspaceToolbarMenuButton({
	"aria-label": ariaLabel,
	content,
	contentClassName = "w-56",
}: {
	"aria-label": string;
	content: ReactNode;
	contentClassName?: string;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<WorkspaceToolbarIconButton aria-label={ariaLabel} />}>
				<Ellipsis />
			</DropdownMenuTrigger>
			<DropdownMenuContent className={contentClassName} align="end">
				{content}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export {
	WorkspaceResponsiveToolbar,
	WorkspaceToolbarGroup,
	WorkspaceToolbarIconButton,
	WorkspaceToolbarMenuButton,
	WorkspaceToolbarTextButton,
};

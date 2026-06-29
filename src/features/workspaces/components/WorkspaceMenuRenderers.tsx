import {
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "#/components/ui/context-menu";
import {
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "#/components/ui/dropdown-menu";
import type { WorkspaceMenuRenderer } from "#/features/workspaces/components/workspace-menu-actions";

export const workspaceDropdownMenuRenderer: WorkspaceMenuRenderer = {
	item: ({ id, children, ...props }) => (
		<DropdownMenuItem key={id} {...props}>
			{children}
		</DropdownMenuItem>
	),
	separator: (id) => <DropdownMenuSeparator key={id} />,
	sub: ({ id, trigger, content }) => (
		<DropdownMenuSub key={id}>
			{trigger}
			{content}
		</DropdownMenuSub>
	),
	subTrigger: ({ children, ...props }) => (
		<DropdownMenuSubTrigger {...props}>{children}</DropdownMenuSubTrigger>
	),
	subContent: ({ children }) => (
		<DropdownMenuSubContent className="w-40">{children}</DropdownMenuSubContent>
	),
};

export const workspaceContextMenuRenderer: WorkspaceMenuRenderer = {
	item: ({ id, children, ...props }) => (
		<ContextMenuItem key={id} {...props}>
			{children}
		</ContextMenuItem>
	),
	separator: (id) => <ContextMenuSeparator key={id} />,
	sub: ({ id, trigger, content }) => (
		<ContextMenuSub key={id}>
			{trigger}
			{content}
		</ContextMenuSub>
	),
	subTrigger: ({ children, ...props }) => (
		<ContextMenuSubTrigger {...props}>{children}</ContextMenuSubTrigger>
	),
	subContent: ({ children }) => (
		<ContextMenuSubContent className="w-40">{children}</ContextMenuSubContent>
	),
};

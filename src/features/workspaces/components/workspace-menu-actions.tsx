import type { ReactNode } from "react";

export type WorkspaceMenuAction =
	| WorkspaceMenuItemAction
	| WorkspaceMenuSeparatorAction
	| WorkspaceMenuSubmenuAction;

export interface WorkspaceMenuItemAction {
	kind: "item";
	id: string;
	label: string;
	leading?: ReactNode;
	trailing?: ReactNode;
	disabled?: boolean;
	variant?: "default" | "destructive";
	onSelect?: () => void;
}

export interface WorkspaceMenuSeparatorAction {
	kind: "separator";
	id: string;
}

export interface WorkspaceMenuSubmenuAction {
	kind: "submenu";
	id: string;
	label: string;
	leading?: ReactNode;
	disabled?: boolean;
	actions: readonly WorkspaceMenuAction[];
}

interface WorkspaceMenuItemRenderInput {
	id: string;
	disabled?: boolean;
	variant?: "default" | "destructive";
	onClick?: () => void;
	children: ReactNode;
}

interface WorkspaceMenuSubRenderInput {
	id: string;
	trigger: ReactNode;
	content: ReactNode;
}

interface WorkspaceMenuSubTriggerRenderInput {
	disabled?: boolean;
	children: ReactNode;
}

interface WorkspaceMenuSubContentRenderInput {
	children: ReactNode;
}

export interface WorkspaceMenuRenderer {
	item: (input: WorkspaceMenuItemRenderInput) => ReactNode;
	separator: (id: string) => ReactNode;
	sub: (input: WorkspaceMenuSubRenderInput) => ReactNode;
	subTrigger: (input: WorkspaceMenuSubTriggerRenderInput) => ReactNode;
	subContent: (input: WorkspaceMenuSubContentRenderInput) => ReactNode;
}

export function renderWorkspaceMenuActions(
	actions: readonly WorkspaceMenuAction[],
	renderer: WorkspaceMenuRenderer,
): ReactNode[] {
	return actions.map((action) => renderWorkspaceMenuAction(action, renderer));
}

export function applyWorkspaceMenuReadOnly(
	actions: readonly WorkspaceMenuAction[],
): WorkspaceMenuAction[] {
	return actions.map((action) => {
		if (action.kind === "separator") {
			return action;
		}

		if (action.kind === "item") {
			return {
				...action,
				disabled: true,
				onSelect: undefined,
			};
		}

		return {
			...action,
			disabled: true,
			actions: applyWorkspaceMenuReadOnly(action.actions),
		};
	});
}

export function workspaceMenuItemInteraction(readOnly: boolean, onSelect: () => void) {
	return {
		disabled: readOnly,
		onClick: readOnly ? undefined : onSelect,
	} as const;
}

function renderWorkspaceMenuAction(
	action: WorkspaceMenuAction,
	renderer: WorkspaceMenuRenderer,
): ReactNode {
	switch (action.kind) {
		case "item":
			return renderer.item({
				id: action.id,
				disabled: action.disabled,
				variant: action.variant,
				onClick: action.onSelect,
				children: (
					<>
						{action.leading}
						<span>{action.label}</span>
						{action.trailing !== undefined && action.trailing !== null ? (
							<span className="ml-auto text-xs text-muted-foreground">{action.trailing}</span>
						) : null}
					</>
				),
			});
		case "separator":
			return renderer.separator(action.id);
		case "submenu":
			return renderer.sub({
				id: action.id,
				trigger: renderer.subTrigger({
					disabled: action.disabled,
					children: (
						<>
							{action.leading}
							<span>{action.label}</span>
						</>
					),
				}),
				content: renderer.subContent({
					children: renderWorkspaceMenuActions(action.actions, renderer),
				}),
			});
	}
}
